/** Product prices use legacy storage units; the storefront presents 1,000 units as USD 1. */
export const PRODUCT_UNITS_PER_USD = 1_000;

export function formatProductUsd(units: number) {
  const dollars = units / PRODUCT_UNITS_PER_USD;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2 }).format(dollars);
}

export const productUnitsFromUsd = (dollars: number) => Math.round(dollars * PRODUCT_UNITS_PER_USD);
export const productUsdFromUnits = (units: number) => units / PRODUCT_UNITS_PER_USD;
