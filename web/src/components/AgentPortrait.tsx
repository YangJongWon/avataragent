import { builtinSkin } from '../../../shared/skins.ts';
import { modelOf } from '../../../shared/models.ts';
import { characterFor, formFor, portraitFor } from '../../../shared/theme-pack.ts';
import type { Agent, Expression } from '../../../shared/types.ts';
import { themeApi } from '../themeApi.ts';
import { useThemeManifest } from '../useThemePack.ts';
import { CharacterPreview } from './CharacterPreview.tsx';
import { PackCharacterPreview } from './PackCharacterPreview.tsx';
import './themes.css';

/**
 * An agent's face for dialogs: the theme's portrait for the expression when it has one,
 * otherwise the theme character's idle frame, otherwise the pixel drawing with that expression.
 */
export function AgentPortrait({ agent, themeId, expression = agent.expression }: { agent: Agent; themeId?: string; expression?: Expression }) {
  const theme = useThemeManifest(themeId);
  if (theme) {
    const character = characterFor(theme, agent.skin, agent.role);
    const portrait = portraitFor(character, expression, formFor(character, modelOf(agent.model))?.form);
    if (portrait) return <img className="agent-portrait" src={themeApi.previewUrl(theme.id, portrait)} alt={`${agent.name} (${expression})`} />;
    return <PackCharacterPreview themeId={theme.id} character={character} title={agent.name} />;
  }
  return <CharacterPreview role={agent.role} skin={builtinSkin(agent.skin)} modelId={agent.model} expression={expression} title={agent.name} />;
}
