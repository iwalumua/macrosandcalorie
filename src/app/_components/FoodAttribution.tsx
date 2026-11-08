/**
 * Where a food's numbers came from. USDA asks that FoodData Central be credited
 * as the source. Open Food Facts' terms require attribution, and suggest the
 * wording used here; its data is volunteer-entered, so people are told to check
 * it against the label.
 */
export function FoodAttribution({ source }: { source: "usda" | "off" | "custom" }) {
  const link = "font-medium text-primary underline";
  if (source === "usda") {
    return (
      <p className="mt-6 text-xs text-muted">
        Nutrition data:{" "}
        <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener noreferrer" className={link}>
          USDA FoodData Central
        </a>{" "}
        (public domain).
      </p>
    );
  }
  if (source === "off") {
    return (
      <p className="mt-6 text-xs text-muted">
        Contains data from{" "}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer" className={link}>
          Open Food Facts
        </a>
        , available under the{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer" className={link}>
          Open Database License
        </a>
        . Volunteers enter it, so it can be incomplete or wrong. Check it against the label.
      </p>
    );
  }
  return null;
}
