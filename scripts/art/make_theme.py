"""
Builds an office theme package from a recipe, drawing every picture with a local Stable Diffusion
model through ComfyUI's HTTP API.

    python -m venv .venv-art && .venv-art/Scripts/python -m pip install rembg onnxruntime pillow
    .venv-art/Scripts/python scripts/art/make_theme.py art/themes/illust-office/art.json

Needs: a running ComfyUI (default http://127.0.0.1:8188) with the recipe's checkpoint in models/checkpoints.
A separate venv keeps rembg away from ComfyUI's own packages.

A recipe with "room": {"stage": ...} gets a flat wall-and-floor stage instead of a generated room, and its
"layout" (seats, lounge, spots, door) is both where props are placed and what the package tells the app.

Generated pictures are cached in art/build/<id>/raw, so a rerun only draws what changed; pass
--redo <key> (repeatable) to draw one again, or change its seed in the recipe.
Output: art/build/<id>/theme (the package folder) and art/build/<id>.zip, ready to install.
"""

import argparse
import io
import json
import shutil
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

SCENE_W, SCENE_H = 1000, 480
ROLES = ['manager', 'researcher', 'writer', 'reviewer']


def vivid(figure: Image.Image) -> Image.Image:
    """Back views sometimes come out washed out, without the dark outlines the other poses have; stretch those."""
    alpha = figure.getchannel('A')
    shades = sorted(l for l, a in zip(figure.convert('L').get_flattened_data(), alpha.get_flattened_data()) if a > 200)
    if not shades or shades[len(shades) // 50] < 70:
        return figure
    rgb = ImageOps.autocontrast(figure.convert('RGB'), cutoff=(2, 0), preserve_tone=True)
    rgb.putalpha(alpha)
    return rgb


def stocky_enough(cutout: Image.Image, max_aspect: float) -> bool:
    """True when the figure is no taller than `max_aspect` times its width: SD (chibi) bodies, not tall ones."""
    box = cutout.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box:
        return False
    w, h = box[2] - box[0], box[3] - box[1]
    return h <= w * max_aspect


def floor_shadow(cutout: Image.Image) -> bool:
    """True when a floor shadow came along: the very bottom of the figure is much wider than the feet above it."""
    alpha = cutout.getchannel('A').point(lambda a: 255 if a > 24 else 0)
    box = alpha.getbbox()
    if not box:
        return False
    alpha = alpha.crop(box)
    w, h = alpha.size

    def span(y: int) -> int:
        row = alpha.crop((0, y, w, y + 1)).get_flattened_data()
        xs = [x for x, v in enumerate(row) if v]
        return xs[-1] - xs[0] if xs else 0

    bottom = max(span(y) for y in range(h - max(2, h * 8 // 100), h))
    legs = sorted(span(y) for y in range(h - h * 14 // 100, h - h * 8 // 100))
    return bool(legs) and legs[len(legs) // 2] > 0 and bottom > legs[len(legs) // 2] * 1.3


def one_full_figure(cutout: Image.Image) -> bool:
    """True when a cut-out (RGBA, uncropped) shows a single figure, head to feet, not cut by the frame.

    SD sometimes adds little copies of the character or zooms in; those make bad sprites. Backgrounds are not
    reliably white, so this looks at the cut-out mask: one blob must hold almost everything and stay off the
    top edge.
    """
    small = cutout.getchannel('A').resize((cutout.width // 8, cutout.height // 8))
    w, h = small.size
    ink = [v > 128 for v in small.get_flattened_data()]
    seen = [False] * (w * h)
    blobs = []
    for start in range(w * h):
        if not ink[start] or seen[start]:
            continue
        stack, size, top, bottom = [start], 0, h, 0
        seen[start] = True
        while stack:
            i = stack.pop()
            size += 1
            y, x = divmod(i, w)
            top, bottom = min(top, y), max(bottom, y)
            for j in (i - 1 if x else -1, i + 1 if x < w - 1 else -1, i - w, i + w):
                if 0 <= j < w * h and ink[j] and not seen[j]:
                    seen[j] = True
                    stack.append(j)
        blobs.append((size, top, bottom))
    if not blobs:
        return False
    blobs.sort(reverse=True)
    size, top, bottom = blobs[0]
    total = sum(b[0] for b in blobs)
    # Feet often rest on the bottom edge, which is fine; a head cut by the top edge means a close-up.
    return size / total > 0.9 and top > 0 and (bottom - top) > h * 0.6


class Comfy:
    def __init__(self, url: str, checkpoint: str):
        self.url = url.rstrip('/')
        self.checkpoint = checkpoint
        self.client = str(uuid.uuid4())

    def _json(self, path: str, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.url + path, data=data, headers={'content-type': 'application/json'})
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            return json.loads(body) if body.strip() else None

    def wait(self, seconds: int = 300):
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                self._json('/system_stats')
                return
            except OSError:
                time.sleep(3)
        raise RuntimeError(f'ComfyUI did not come back at {self.url}')

    def free(self):
        """Unloads the model so background removal has the memory to itself."""
        try:
            self._json('/free', {'unload_models': True, 'free_memory': True})
        except OSError:
            pass  # Not running, so nothing is loaded; everything came from the cache.

    def draw(self, positive: str, negative: str, seed: int, width: int, height: int, key: str) -> Image.Image:
        for attempt in range(5):
            try:
                return self._draw(positive, negative, seed, width, height, key)
            except RuntimeError as error:
                # Short on RAM: sampling runs out, or reloading the checkpoint after a free cannot read it in.
                if not any(m in str(error) for m in ('not enough memory', 'hostbuf_file_reader_read')) or attempt == 4:
                    raise
                print(f'  {key}: out of memory, retrying', flush=True)
                self.free()
                time.sleep(10 + attempt * 20)
            except OSError as error:
                # ComfyUI went away (crash or restart); wait for it to come back and try again.
                if attempt == 4:
                    raise
                print(f'  {key}: lost ComfyUI ({error}), waiting for it', flush=True)
                self.wait()
        raise AssertionError('unreachable')

    def _draw(self, positive: str, negative: str, seed: int, width: int, height: int, key: str) -> Image.Image:
        graph = {
            '4': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': self.checkpoint}},
            '5': {'class_type': 'EmptyLatentImage', 'inputs': {'width': width, 'height': height, 'batch_size': 1}},
            '6': {'class_type': 'CLIPTextEncode', 'inputs': {'text': positive, 'clip': ['4', 1]}},
            '7': {'class_type': 'CLIPTextEncode', 'inputs': {'text': negative, 'clip': ['4', 1]}},
            '3': {
                'class_type': 'KSampler',
                'inputs': {
                    'seed': seed, 'steps': 28, 'cfg': 5.0, 'sampler_name': 'euler_ancestral', 'scheduler': 'normal', 'denoise': 1.0,
                    'model': ['4', 0], 'positive': ['6', 0], 'negative': ['7', 0], 'latent_image': ['5', 0],
                },
            },
            '8': {'class_type': 'VAEDecode', 'inputs': {'samples': ['3', 0], 'vae': ['4', 2]}},
            '9': {'class_type': 'SaveImage', 'inputs': {'filename_prefix': f'avataragent/{key}', 'images': ['8', 0]}},
        }
        prompt_id = self._json('/prompt', {'prompt': graph, 'client_id': self.client})['prompt_id']
        while True:
            history = self._json(f'/history/{prompt_id}')
            if prompt_id in history:
                entry = history[prompt_id]
                if entry.get('status', {}).get('status_str') == 'error':
                    messages = [m[1].get('exception_message', '') for m in entry['status'].get('messages', []) if m[0] == 'execution_error']
                    raise RuntimeError(f'ComfyUI failed on {key}: {" ".join(messages) or entry["status"]}')
                image = entry['outputs']['9']['images'][0]
                query = urllib.parse.urlencode({'filename': image['filename'], 'subfolder': image['subfolder'], 'type': image['type']})
                with urllib.request.urlopen(f'{self.url}/view?{query}', timeout=60) as res:
                    return Image.open(io.BytesIO(res.read())).convert('RGB')
            time.sleep(1)


class Builder:
    def __init__(self, recipe_path: Path, comfy_url: str, redo: set[str]):
        self.recipe = json.loads(recipe_path.read_text(encoding='utf-8'))
        self.id = self.recipe['id']
        self.build = Path('art/build') / self.id
        self.raw = self.build / 'raw'
        self.theme = self.build / 'theme'
        self.raw.mkdir(parents=True, exist_ok=True)
        # The package is rebuilt from scratch each time so nothing stale rides along; drawings stay cached in raw.
        shutil.rmtree(self.theme, ignore_errors=True)
        (self.theme / 'assets').mkdir(parents=True, exist_ok=True)
        self.comfy = Comfy(comfy_url, self.recipe['checkpoint'])
        self.redo = redo
        self._cutter = None
        self.extra_negative: dict[str, str] = {}
        self.pose_keys = {
            f'{who["id"]}-{pose}'
            for c in self.recipe['characters']
            for who in [c, *(self.outfit_spec(c, o) for o in c.get('outfits', []))]
            for pose in self.recipe['character']['poses']
        }
        # Seats are where feet stand; the same layout goes into the package so the app puts people where the art expects.
        self.layout = self.recipe['layout']
        self.style = self.recipe.get('style', '')

    @staticmethod
    def outfit_spec(spec: dict, outfit: dict) -> dict:
        """The character drawn again in other clothes: same seeds by default, so the pose and face stay close."""
        return {
            **spec,
            'id': f'{spec["id"]}-{outfit["id"]}',
            'look': outfit['look'],
            'seed': outfit.get('seed', spec['seed']),
            'poseSeeds': outfit.get('poseSeeds', spec.get('poseSeeds', {})),
        }

    def styled(self, prompt: str) -> str:
        return f'{prompt}, {self.style}' if self.style else prompt

    def seat_points(self, at) -> list[tuple[int, int]]:
        """'seats' is every desk (role seats, then extra seats); 'seat:<role>' one of them; {"x","y"} a fixed point."""
        if at == 'seats':
            return [(p['x'], p['y']) for p in [*(self.layout['seats'][r] for r in ROLES), *self.layout.get('extraSeats', [])]]
        if isinstance(at, str):
            p = self.layout['seats'][at.split(':', 1)[1]]
            return [(p['x'], p['y'])]
        return [(at['x'], at['y'])]

    # ── drawing ────────────────────────────────────────────────
    def room_job(self):
        spec = self.recipe['room']
        return ('room', self.styled(spec['prompt']), spec['seed'], spec['width'], spec['height'])

    def prop_job(self, key: str, spec: dict):
        if spec.get('negative'):
            self.extra_negative[f'prop-{key}'] = spec['negative']
        return (f'prop-{key}', self.styled(spec['prompt']), spec['seed'], spec['width'], spec['height'])

    def pose_job(self, spec: dict, pose: str):
        common = self.recipe['character']
        # A pose that came out wrong can get its own seed in the recipe ("poseSeeds": {"celebrate": 3105}).
        seed = spec.get('poseSeeds', {}).get(pose, spec['seed'])
        # A pose is a prompt, or {"prompt", "drop", "negative"}: "drop" takes out base and look tags containing a word
        # (a back view shows no eyes or glasses and is not "looking at viewer"), "negative" adds to the recipe's.
        entry = common['poses'][pose]
        if isinstance(entry, str):
            entry = {'prompt': entry}
        kept = lambda text: ', '.join(tag for tag in text.split(', ') if not any(word in tag for word in entry.get('drop', [])))
        key = f'{spec["id"]}-{pose}'
        if entry.get('negative'):
            self.extra_negative[key] = entry['negative']
        prompt = f'{kept(common["base"])}, {kept(spec["look"])}, {entry["prompt"]}'
        # Pale hair seen from behind melts into white; such a character can be drawn on another plain colour.
        if spec.get('background'):
            prompt = prompt.replace('white background', f'({spec["background"]}:1.3)')
        return (key, prompt, seed, 832, 1216)

    def face_job(self, spec: dict, expression: str):
        common = self.recipe['character']
        return (f'{spec["id"]}-face-{expression}', f'{common["portrait"]}, {spec["look"]}, {common["portraits"][expression]}', spec['seed'], 1024, 1024)

    def accessory_job(self, key: str, spec: dict):
        return (f'acc-{key}', self.styled(spec['prompt']), spec['seed'], 1024, 1024)

    def all_props(self):
        """Every prop to draw: the theme's, then each variant's (keyed `<variant>-<prop>`), with their state pictures."""
        for key, spec in self.recipe['props'].items():
            yield key, spec
        for variant in self.recipe.get('variants', []):
            for key, spec in variant.get('props', {}).items():
                yield f'{variant["id"]}-{key}', spec

    def jobs(self):
        if 'stage' not in self.recipe['room']:
            yield self.room_job()
        for key, spec in self.all_props():
            yield self.prop_job(key, spec)
            for state, extra in spec.get('states', {}).items():
                if not extra.get('swing'):
                    yield self.prop_job(f'{key}-{state}', {**spec, **extra})
        for variant in self.recipe.get('variants', []):
            for key, spec in variant.get('wear', {}).items():
                yield self.accessory_job(f'{variant["id"]}-{key}', spec)
        for spec in self.recipe['characters']:
            for pose in self.recipe['character']['poses']:
                yield self.pose_job(spec, pose)
                for outfit in spec.get('outfits', []):
                    yield self.pose_job(self.outfit_spec(spec, outfit), pose)
            for expression in self.recipe['character']['portraits']:
                yield self.face_job(spec, expression)
        for key, spec in self.recipe.get('accessories', {}).items():
            yield self.accessory_job(key, spec)

    def draw(self, key: str, prompt: str, seed: int, width: int, height: int) -> Image.Image:
        cached = self.raw / f'{key}.png'
        if cached.exists() and key not in self.redo:
            return Image.open(cached).convert('RGB')
        positive = f'{prompt}, {self.recipe["quality"]}'
        # Poses must be one whole SD figure; try other seeds until one is, keeping the last try if none pass.
        tries = 8 if key in self.pose_keys else 1
        max_aspect = self.recipe['character'].get('maxAspect', 99)
        for attempt in range(tries):
            trial = seed + attempt * 101
            print(f'  drawing {key} (seed {trial})', flush=True)
            negative = ', '.join(filter(None, [self.recipe['negative'], self.extra_negative.get(key)]))
            image = self.comfy.draw(positive, negative, trial, width, height, key)
            if tries == 1:
                break
            cut = self.cutout(image)
            if not one_full_figure(cut):
                print(f'  {key}: seed {trial} is not one whole figure', flush=True)
            elif not stocky_enough(cut, max_aspect):
                print(f'  {key}: seed {trial} is too tall for SD proportions', flush=True)
            elif floor_shadow(self.cut(image)):
                print(f'  {key}: seed {trial} has a shadow on the floor', flush=True)
            else:
                break
        if trial != seed:
            print(f'  {key}: using seed {trial} (put it in poseSeeds to keep it)', flush=True)
        image.save(cached)
        self.redo.discard(key)
        return image

    def cutout(self, image: Image.Image) -> Image.Image:
        """The anime-trained background removal, uncropped."""
        if self._cutter is None:
            from rembg import new_session, remove

            session = new_session('isnet-anime')
            self._cutter = lambda img: remove(img, session=session)
        return self._cutter(image).convert('RGBA')

    def cut(self, image: Image.Image, kind: str = 'character') -> Image.Image:
        """Removes the background and trims to the subject.

        People go through an anime-trained model. Objects were drawn on white, and that model reads them as
        background, so for them the white is flood-filled away from the edges instead.
        """
        if kind == 'object':
            out = image.convert('RGBA')
            marker = (255, 0, 255)
            work = image.convert('RGB')
            w, h = work.size
            # Usually white, sometimes another flat colour: fill from every edge point that matches the corner.
            corner = work.getpixel((0, 0))
            for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
                px = work.getpixel((x, y))
                if px != marker and sum(abs(a - b) for a, b in zip(px, corner)) < 60:
                    ImageDraw.floodfill(work, (x, y), marker, thresh=60)
            gone = work.point(lambda v: 0).convert('L')
            gone.putdata([255 if px == marker else 0 for px in work.get_flattened_data()])
            alpha = out.getchannel('A')
            alpha.paste(0, mask=gone)
            out.putalpha(alpha)
            box = alpha.getbbox()
            return out.crop(box) if box else out
        alpha = self.fill_holes(image, self.cutout(image).getchannel('A'))
        # The cut-out blanks the colour of pixels it dropped, so restored ones take theirs from the drawing.
        out = image.convert('RGBA')
        out.putalpha(alpha)
        box = out.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
        return out.crop(box) if box else out

    @staticmethod
    def fill_holes(image: Image.Image, alpha: Image.Image) -> Image.Image:
        """The anime model sometimes thins out pale hair. People are drawn on a plain background, so a pixel the
        model half kept and the background flood fill cannot reach is part of the figure. Pixels it dropped
        entirely (floor shadows) stay dropped."""
        work = image.convert('RGB')
        marker = (255, 0, 255)
        w, h = work.size
        for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w - 1, h // 2)]:
            if work.getpixel((x, y)) != marker:
                ImageDraw.floodfill(work, (x, y), marker, thresh=36)
        inside = Image.new('L', (w, h))
        inside.putdata([0 if px == marker else 255 for px in work.get_flattened_data()])
        if sum(1 for v in inside.get_flattened_data() if v == 0) < w * h * 0.3:
            return alpha  # Busy background: the flood fill tells us nothing.
        # Back views often confuse the model into keeping the whole figure only faintly; then the plain-background
        # silhouette is the better mask.
        area = sum(1 for v in inside.get_flattened_data() if v)
        held = sum(a for a, v in zip(alpha.get_flattened_data(), inside.get_flattened_data()) if v)
        if area and held < area * 255 * 0.6:
            return ImageChops.lighter(alpha, inside.filter(ImageFilter.GaussianBlur(1)))
        kept = alpha.point(lambda a: 255 if a > 8 else 0)
        return ImageChops.lighter(alpha, ImageChops.multiply(inside, kept))

    def save(self, image: Image.Image, path: str) -> str:
        image.save(self.theme / path, optimize=True)
        return path

    # ── parts ──────────────────────────────────────────────────
    def stage(self, spec: dict) -> Image.Image:
        """A flat game stage: wall band on top, front-facing floorboards below, so seats and spots line up exactly.

        Generated rooms come with their own perspective and furniture, which never match a fixed layout.
        With "areas" ({"work": {"x", "w"}, "lounge": {"x", "w", "colors"}}), each space gets its own wall and
        floor colors and a pillar between them.
        """
        styles = lambda area: {k: area.get(k, spec.get(k)) for k in ('wallStyle', 'floorStyle')}
        if 'areas' not in spec:
            return self.wall_and_floor(spec['colors'], spec['floorY'], **styles({}))
        img = Image.new('RGB', (SCENE_W, SCENE_H))
        for area in spec['areas'].values():
            whole = self.wall_and_floor({**spec['colors'], **area.get('colors', {})}, spec['floorY'], **styles(area))
            img.paste(whole.crop((area['x'], 0, area['x'] + area['w'], SCENE_H)), (area['x'], 0))
        d = ImageDraw.Draw(img)
        for area in spec['areas'].values():
            x = area['x']
            if x <= 0:
                continue
            c = {**spec['colors'], **area.get('colors', {})}
            d.rectangle((x - 7, 0, x + 7, spec['floorY']), fill=c['trim'])
            d.rectangle((x - 3, 0, x + 3, spec['floorY']), fill=c['baseboard'])
            d.line((x, spec['floorY'], x, SCENE_H), fill=c['floorLine'], width=3)
        return img

    def wall_and_floor(self, c: dict, floor_y: int, wallStyle: str | None = None, floorStyle: str | None = None) -> Image.Image:
        """Wall styles: `stripes` (wainscoted wallpaper), `glass` (office partition panes), `panels` (metal with a glow strip).
        Floor styles: `boards`, `carpet` (tiles), `grid` (dark with glowing lines). `glow` is the colour of light lines."""
        img = Image.new('RGB', (SCENE_W, SCENE_H), c['wall'])
        d = ImageDraw.Draw(img)
        rail = floor_y - 58
        wall = wallStyle or 'stripes'
        if wall == 'glass':
            # Frosted partition panes in slim frames above a solid lower band.
            top = 34
            d.rectangle((0, 0, SCENE_W, top), fill=c['wallStripe'])
            for x in range(0, SCENE_W, 125):
                d.rectangle((x + 6, top + 8, x + 119, rail - 10), fill=c['panel'])
                d.polygon([(x + 30, top + 8), (x + 58, top + 8), (x + 22, rail - 10), (x + 6, rail - 10), (x + 6, rail - 40)], fill=c['wallStripe'])
                d.rectangle((x + 6, top + 8, x + 119, rail - 10), outline=c['panelLine'], width=3)
            d.rectangle((0, rail - 10, SCENE_W, floor_y), fill=c['trim'])
            d.line((0, rail - 10, SCENE_W, rail - 10), fill=c['panelLine'], width=3)
        elif wall == 'panels':
            # Riveted plates with seams, and a glowing strip along the top and at the rail.
            for x in range(0, SCENE_W, 96):
                d.rectangle((x + 2, 14, x + 93, rail - 4), fill=c['wallStripe'] if (x // 96) % 2 else c['wall'], outline=c['panelLine'], width=2)
                for rx, ry in ((x + 10, 22), (x + 85, 22), (x + 10, rail - 12), (x + 85, rail - 12)):
                    d.ellipse((rx - 2, ry - 2, rx + 2, ry + 2), fill=c['panelLine'])
            d.rectangle((0, 0, SCENE_W, 12), fill=c['trim'])
            d.rectangle((0, 12, SCENE_W, 15), fill=c['glow'])
            d.rectangle((0, rail, SCENE_W, floor_y), fill=c['panel'])
            d.rectangle((0, rail - 2, SCENE_W, rail + 2), fill=c['glow'])
            for x in range(30, SCENE_W, 120):
                d.rectangle((x, rail + 18, x + 60, rail + 24), fill=c['panelLine'])
        else:
            for x in range(0, SCENE_W, 48):
                d.rectangle((x, 0, x + 23, floor_y), fill=c['wallStripe'])
            d.rectangle((0, 0, SCENE_W, 9), fill=c['trim'])
            d.rectangle((0, rail, SCENE_W, floor_y), fill=c['panel'])
            for x in range(8, SCENE_W, 100):
                d.rounded_rectangle((x, rail + 12, x + 84, floor_y - 12), radius=4, outline=c['panelLine'], width=2)
            d.rectangle((0, rail - 3, SCENE_W, rail + 3), fill=c['trim'])
        d.rectangle((0, floor_y - 8, SCENE_W, floor_y), fill=c['baseboard'])
        # Rows get taller toward the viewer, so the floor reads as receding without any vanishing point.
        floor = floorStyle or 'boards'
        y, row, h = floor_y, 0, 20.0
        while y < SCENE_H:
            bottom = min(SCENE_H, round(y + h))
            if floor == 'carpet':
                # Square-ish tiles in a loose checker; tile width grows with the row like the height does.
                tw = round(h * 2.2)
                for i, x in enumerate(range(-(row * 37) % tw - tw, SCENE_W, tw)):
                    d.rectangle((x, y, x + tw, bottom), fill=c['floor'] if (i + row) % 2 == 0 else c['floorAlt'])
                    d.line((x, y, x, bottom), fill=c['floorLine'], width=1)
                d.line((0, bottom, SCENE_W, bottom), fill=c['floorLine'], width=1)
            elif floor == 'grid':
                d.rectangle((0, y, SCENE_W, bottom), fill=c['floor'] if row % 2 == 0 else c['floorAlt'])
                d.line((0, y, SCENE_W, y), fill=c['glow'] if row % 3 == 2 else c['floorLine'], width=2)
                # Columns fan out from the middle so the floor seems to recede.
                spread = 1 + row * 0.08
                for k in range(-12, 13):
                    x0, x1 = SCENE_W / 2 + k * 80 * (spread - 0.04), SCENE_W / 2 + k * 80 * spread
                    d.line((x0, y, x1, bottom), fill=c['floorLine'], width=1)
            else:
                d.rectangle((0, y, SCENE_W, bottom), fill=c['floor'] if row % 2 == 0 else c['floorAlt'])
                d.line((0, bottom, SCENE_W, bottom), fill=c['floorLine'], width=2)
                offset = (row * 97) % 160
                for x in range(offset - 160, SCENE_W, 160 + row % 3 * 20):
                    d.line((x, y, x, bottom), fill=c['floorLine'], width=2)
            y, row, h = bottom, row + 1, h * 1.12
        shadow = Image.new('L', (SCENE_W, 26), 0)
        for i in range(26):
            ImageDraw.Draw(shadow).line((0, i, SCENE_W, i), fill=round(70 * (1 - i / 26)))
        img.paste(Image.new('RGB', (SCENE_W, 26), c['floorLine']), (0, floor_y), shadow)
        return img

    def room(self) -> Image.Image:
        if 'stage' in self.recipe['room']:
            return self.stage(self.recipe['room']['stage'])
        image = self.draw(*self.room_job())
        scale = max(SCENE_W / image.width, SCENE_H / image.height)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        left = (image.width - SCENE_W) // 2
        top = (image.height - SCENE_H) // 2
        return image.crop((left, top, left + SCENE_W, top + SCENE_H))

    def props(self, recipe_props=None, prefix=''):
        """Pictures placed on the room, one entry per placement: (key, spec, picture, x, y, state pictures).

        Each prop stays its own picture in the package, so a theme or a variant can swap one piece of furniture,
        and a door can show itself open.
        """
        placed = []
        for key, spec in (self.recipe['props'] if recipe_props is None else recipe_props).items():
            key = f'{prefix}{key}'
            item = self.cut(self.draw(*self.prop_job(key, spec)), 'object')
            if 'spot' in spec:
                s = self.layout['spots'][spec['spot']]
                x, y, w, h = s['x'], s['y'], s['w'], s['h']
                scale = min(w / item.width, h / item.height)
                item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
                # Bottom-aligned so floor furniture stands on the floor line of its spot.
                places = [(x + (w - item.width) // 2, y + h - item.height)]
                # The app draws on and around spots (board text, profit label, flying coins), so the spot becomes
                # the picture's real outline, or for a board its writing surface.
                box = self.surface(item) if spec.get('surface') else item.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
                if box:
                    px, py = places[0]
                    self.layout['spots'][spec['spot']] = {'x': px + box[0], 'y': py + box[1], 'w': box[2] - box[0], 'h': box[3] - box[1]}
            else:
                scale = spec['size'] / (item.width if spec.get('fit') == 'width' else item.height)
                item = item.resize((round(item.width * scale), round(item.height * scale)), Image.LANCZOS)
                places = []
                for at in spec['at']:
                    for cx, cy in self.seat_points(at):
                        places.append((round(cx + spec.get('dx', 0) - item.width / 2), round(cy + spec.get('below', 0) - item.height)))
            # A state picture (an open door) is drawn on its own, then sized and stood where the usual one stands.
            states = {}
            for state, extra in spec.get('states', {}).items():
                if extra.get('swing'):
                    states[state] = (self.swung_open(item, extra), 0, 0)
                    continue
                other = self.cut(self.draw(*self.prop_job(f'{key}-{state}', {**spec, **extra})), 'object')
                scale = min(item.width / other.width, item.height / other.height)
                other = other.resize((max(1, round(other.width * scale)), max(1, round(other.height * scale))), Image.LANCZOS)
                states[state] = (other, (item.width - other.width) // 2, item.height - other.height)
            for i, (px, py) in enumerate(places):
                placed.append((key if len(places) == 1 else f'{key}-{i + 1}', key, spec, item, px, py, states))
        # Farther furniture first so nearer pieces overlap it.
        placed.sort(key=lambda p: p[5] + p[3].height)
        return placed

    @staticmethod
    def swung_open(door: Image.Image, spec: dict) -> Image.Image:
        """The same door opened: a dark doorway inside the frame and the leaf turned edge-on at the hinge.

        Image models rarely draw an open door that matches a closed one, so the open look is made from the closed picture.
        `frame` is the frame's share of the width and `top` of the height, measured on the picture.
        """
        w, h = door.size
        fx, top = round(w * spec.get('frame', 0.14)), round(h * spec.get('top', 0.12))
        x0, x1, y1 = fx, w - fx, h - max(2, round(h * 0.02))
        out = door.copy()
        hole = Image.new('RGBA', (x1 - x0, y1 - top))
        dark, light = (54, 40, 46), (122, 96, 84)
        for y in range(hole.height):
            t = y / max(1, hole.height - 1)
            # The far room is dark, with light from it spilling onto the floor near the threshold.
            c = tuple(round(a + (b - a) * max(0, t - 0.55) / 0.45) for a, b in zip(dark, light))
            ImageDraw.Draw(hole).line((0, y, hole.width, y), fill=(*c, 255))
        out.alpha_composite(hole, (x0, top))
        leaf = door.crop((x0, top, x1, y1))
        narrow = leaf.resize((max(4, round(leaf.width * spec.get('leaf', 0.28))), leaf.height), Image.LANCZOS)
        shade = Image.new('RGBA', narrow.size, (0, 0, 0, 70))
        narrow = Image.alpha_composite(narrow, Image.composite(shade, Image.new('RGBA', narrow.size), narrow.getchannel('A')))
        out.alpha_composite(narrow, (x1 - narrow.width, top))
        return out

    def export_props(self, placed):
        """Saves prop pictures (once per kind) and returns the manifest entries."""
        out = []
        for pid, key, spec, item, px, py, states in placed:
            if px < 0 or py < 0:
                # Past the scene's top or left edge: that placement gets its own picture with the outside cut off.
                item = item.crop((max(0, -px), max(0, -py), item.width, item.height))
                entry = {'id': pid, 'image': self.save(item, f'assets/prop-{pid}.png'), 'x': max(0, px), 'y': max(0, py)}
            else:
                entry = {'id': pid, 'image': self.save(item, f'assets/prop-{key}.png'), 'x': px, 'y': py}
            if spec.get('front'):
                entry['front'] = True
            if spec.get('door'):
                entry['spot'] = 'door'
            elif 'spot' in spec:
                entry['spot'] = spec['spot']
            if states:
                # State pictures share the usual picture's top-left, so they are padded onto a canvas of the same size.
                entry['states'] = {}
                for state, (other, dx, dy) in states.items():
                    canvas = Image.new('RGBA', item.size, (0, 0, 0, 0))
                    canvas.alpha_composite(other, (dx, dy))
                    entry['states'][state] = self.save(canvas, f'assets/prop-{key}-{state}.png')
            out.append(entry)
        return out

    def wear(self, variant: dict):
        layers = []
        for key, spec in variant.get('wear', {}).items():
            key = f'{variant["id"]}-{key}'
            item = self.cut(self.draw(*self.accessory_job(key, spec)), 'object')
            scale = spec['size'] / max(item.width, item.height)
            item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
            layers.append({'image': self.save(item, f'assets/wear-{key}.png'), 'at': spec.get('at', 'head'), 'x': spec.get('x', 0), 'y': spec.get('y', 0), 'scale': 1})
        return layers

    @staticmethod
    def surface(item: Image.Image):
        """Bounding box of a chalkboard's dark green writing area, ignoring the frame and stray specks."""
        rgb = item.convert('RGB')
        mask = Image.new('L', item.size)
        mask.putdata([255 if g > r + 12 and g >= b - 10 and r + g + b < 360 else 0 for r, g, b in rgb.get_flattened_data()])
        mask = mask.filter(ImageFilter.MinFilter(5))
        box = mask.getbbox()
        if not box:
            return None
        # MinFilter shrank it by 2 px per side.
        return (box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2)

    def flatten(self, base: Image.Image | None, pieces) -> Image.Image:
        canvas = Image.new('RGBA', (SCENE_W, SCENE_H), (0, 0, 0, 0)) if base is None else base.convert('RGBA')
        for item, x, y in pieces:
            canvas.alpha_composite(item, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
        return canvas

    def character(self, spec: dict):
        """One sprite sheet per character: a frame per pose, all the same size, feet on the bottom edge.

        "outfits" ([{"id", "name", "look"}]) draws the character again in other clothes, each its own sheet with the same
        frames. "split" ({"head": 0.42, "legs": 0.74}, fractions of the figure's height from the top of the hair) cuts
        the sheet into legs, body and head layers instead of one picture, so later outfits can swap one part.
        """
        common = self.recipe['character']
        height = common['height']

        def posed(who: dict):
            frames = {}
            for pose in common['poses']:
                img = vivid(self.cut(self.draw(*self.pose_job(who, pose))))
                frames[pose] = img.resize((round(img.width * height / img.height), height), Image.LANCZOS)
            return frames

        frames = posed(spec)
        outfits = [(o, posed(self.outfit_spec(spec, o))) for o in spec.get('outfits', [])]
        # Every sheet of the character shares one frame size, so outfits line up with the frame rectangles.
        fw = max(f.width for set_ in [frames, *(f for _, f in outfits)] for f in set_.values()) + 8
        fh = height + 4
        names = {pose: f'f{i}' for i, pose in enumerate(frames)}

        def sheet_of(set_: dict) -> Image.Image:
            sheet = Image.new('RGBA', (fw * len(set_), fh), (0, 0, 0, 0))
            for i, img in enumerate(set_.values()):
                sheet.alpha_composite(img, (i * fw + (fw - img.width) // 2, fh - img.height))
            return sheet

        idle = frames['idle']
        sheet = sheet_of(frames)
        parts = {}
        if 'split' in spec:
            # Each frame is cut at the same share of its own figure, so a bowing or cheering pose splits where it should.
            layers = {slot: Image.new('RGBA', sheet.size, (0, 0, 0, 0)) for slot in ('legs', 'body', 'head')}
            for i, img in enumerate(frames.values()):
                top = fh - img.height
                head_y = top + round(img.height * spec['split']['head'])
                legs_y = top + round(img.height * spec['split']['legs'])
                x0, x1 = i * fw, (i + 1) * fw
                for slot, (y0, y1) in {'head': (0, head_y), 'body': (head_y, legs_y), 'legs': (legs_y, fh)}.items():
                    layers[slot].paste(sheet.crop((x0, y0, x1, y1)), (x0, y0))
            sheet_path = self.save(layers['legs'], f'assets/{spec["id"]}-legs.png')
            parts = {slot: self.save(layers[slot], f'assets/{spec["id"]}-{slot}.png') for slot in ('body', 'head')}
        else:
            sheet_path = self.save(sheet, f'assets/{spec["id"]}.png')
        outfit_entries = [
            {'id': o['id'], 'name': o.get('name', o['id']), 'sheet': self.save(sheet_of(f), f'assets/{spec["id"]}-{o["id"]}.png')}
            for o, f in outfits
        ]

        portraits = {}
        for expression in common['portraits']:
            face = self.cut(self.draw(*self.face_job(spec, expression)))
            side = 256
            scale = side / max(face.width, face.height)
            face = face.resize((round(face.width * scale), round(face.height * scale)), Image.LANCZOS)
            square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            square.alpha_composite(face, ((side - face.width) // 2, side - face.height))
            portraits[expression] = self.save(square, f'assets/{spec["id"]}-{expression}.png')

        return {
            'id': spec['id'],
            'name': spec['name'],
            'sheet': sheet_path,
            'frames': {f'f{i}': {'x': i * fw, 'y': 0, 'w': fw, 'h': fh} for i in range(len(frames))},
            'anchor': {'x': 0.5, 'y': 1},
            # The hat or hairpin sits a little below the very top of the hair.
            'head': {'x': 0.5, 'y': round((fh - idle.height + idle.height * 0.06) / fh, 3)},
            # Frames are as wide as the widest pose, so the idle figure's hand is measured from its own size.
            'hand': {'x': round((fw / 2 + idle.width * common.get('handX', 0.3)) / fw, 3), 'y': round((fh - idle.height * common.get('handFromBottom', 0.3)) / fh, 3)},
            'scale': round(common['sceneHeight'] / height, 3),
            'states': {
                'idle': {'frames': [names['idle']]},
                'celebrate': {'frames': [names['celebrate'], names['idle']], 'fps': 3},
                'troubled': {'frames': [names['troubled']]},
                **({'back': {'frames': [names['back']]}} if 'back' in names else {}),
            },
            'portraits': portraits,
            **({'parts': parts} if parts else {}),
            **({'outfits': outfit_entries} if outfit_entries else {}),
        }, idle

    def accessories(self):
        out = {}
        for key, spec in self.recipe.get('accessories', {}).items():
            item = self.cut(self.draw(*self.accessory_job(key, spec)), 'object')
            scale = spec['size'] / max(item.width, item.height)
            item = item.resize((max(1, round(item.width * scale)), max(1, round(item.height * scale))), Image.LANCZOS)
            path = self.save(item, f'assets/acc-{key}.png')
            layer = spec['layer']
            tiers = out.setdefault(layer['company'], {})
            tiers.setdefault(layer['tier'], []).append({'image': path, 'at': layer['at'], 'x': layer['x'], 'y': layer['y'], 'scale': 1})
        return out

    # ── package ────────────────────────────────────────────────
    def run(self, zip_path: Path):
        print(f'theme {self.id}', flush=True)
        # Draw everything first, then free the model: generation and background removal do not share RAM.
        for job in self.jobs():
            self.draw(*job)
        self.comfy.free()
        print('drawing done, building the package', flush=True)
        room = self.room().convert('RGB')
        placed = self.props()
        props = self.export_props(placed)
        back = [(item, px, py) for _, _, spec, item, px, py, _ in placed if not spec.get('front')]
        front = [(item, px, py) for _, _, spec, item, px, py, _ in placed if spec.get('front')]
        # Each space is its own background picture (walls and floor only), so a theme can swap the work space and the lounge separately.
        areas = {name: {'x': a['x'], 'y': 0, 'w': a['w'], 'h': SCENE_H} for name, a in self.recipe['room'].get('stage', {}).get('areas', {}).items()}
        if areas:
            layers = []
            for name, a in areas.items():
                path = self.save(room.crop((a['x'], 0, a['x'] + a['w'], SCENE_H)), f'assets/room-{name}.png')
                layers.append({'image': path, 'x': a['x'], 'y': 0, 'area': name})
        else:
            layers = [{'image': self.save(room, 'assets/room.png'), 'x': 0, 'y': 0}]

        variants = []
        for variant in self.recipe.get('variants', []):
            out = {k: v for k, v in variant.items() if k not in ('props', 'wear')}
            if variant.get('props'):
                out['props'] = self.export_props(self.props(variant['props'], f'{variant["id"]}-'))
            if variant.get('wear'):
                out['wear'] = self.wear(variant)
            variants.append(out)

        characters, idles = [], []
        for spec in self.recipe['characters']:
            data, idle = self.character(spec)
            characters.append(data)
            idles.append((idle, data['scale']))

        # Gallery preview: the room with everyone at their desks, half size.
        scene = self.flatten(room, back)
        placed = []
        for role, (idle, scale) in zip(ROLES, idles):
            small = idle.resize((round(idle.width * scale), round(idle.height * scale)), Image.LANCZOS)
            seat = self.layout['seats'][role]
            placed.append((small, round(seat['x'] - small.width / 2), seat['y'] - small.height))
        placed.sort(key=lambda piece: piece[2] + piece[0].height)
        scene = self.flatten(scene, placed)
        if front:
            scene = self.flatten(scene, front)
        scene.convert('RGB').save(self.build / 'preview-full.png')
        self.save(scene.convert('RGB').resize((SCENE_W // 2, SCENE_H // 2), Image.LANCZOS), 'preview.png')

        manifest = {
            'format': 'avataragent-theme',
            'version': 1,
            'id': self.id,
            'themeVersion': self.recipe['themeVersion'],
            'name': self.recipe['name'],
            'author': self.recipe['author'],
            'license': self.recipe['license'],
            'description': self.recipe['description'],
            'preview': 'preview.png',
            'scene': {
                'layers': layers,
                'seats': self.layout['seats'],
                'lounge': self.layout['lounge'],
                'extraSeats': self.layout.get('extraSeats', []),
                'extraLounge': self.layout.get('extraLounge', []),
                'door': self.layout.get('door'),
                'spots': self.layout['spots'],
                'areas': areas,
                **{k: self.recipe['paths'][k] for k in ('waypoints', 'links', 'walkSpeed') if k in self.recipe.get('paths', {})},
                'scaleMode': 'linear',
            },
            'characters': characters,
            'tokens': self.recipe.get('tokens', {}),
            'site': self.recipe.get('site', {}),
            'accessories': self.accessories(),
            'props': props,
            # Icons, lines, friendly menu items, event reactions and dress rules are written in the recipe as they go in the package.
            **{k: self.recipe[k] for k in ('emotes', 'interactions', 'events', 'dress') if k in self.recipe},
            'variants': variants,
        }
        (self.theme / 'theme.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        (self.theme / 'CREDITS.txt').write_text(self.recipe.get('credits', '') + '\n', encoding='utf-8')

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in sorted(self.theme.rglob('*')):
                if file.is_file():
                    z.write(file, file.relative_to(self.theme).as_posix())
        print(f'wrote {zip_path} ({zip_path.stat().st_size // 1024} KB)')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('recipe', type=Path)
    parser.add_argument('--comfy', default='http://127.0.0.1:8188')
    parser.add_argument('--redo', action='append', default=[], help='draw this key again (e.g. yuna-idle, prop-desk, room)')
    args = parser.parse_args()
    builder = Builder(args.recipe, args.comfy, set(args.redo))
    builder.run(Path('art/build') / f'{builder.id}.zip')


if __name__ == '__main__':
    main()
