# Recipes

The V1 recipe catalog uses a 200 ml target pour. Ingredient volumes are derived
from ratio parts:

```text
ingredient_ml = 200 ml * ingredient_parts / total_parts
```

All volumes below are rounded to one decimal place.

## Math Check

| Recipe | Ratio Total | Calculated Total |
|---|---:|---:|
| California Negroni | 14 parts | 200.0 ml |
| Pony Espresso Martini | 4 parts | 200.0 ml |
| Old Pal | 3 parts | 200.1 ml |
| Mare-garita | 13 parts | 200.0 ml |
| Moscow Mule | 7 parts | 200.0 ml |
| Kentucky Derby Julep | 5 parts | 200.0 ml |

Old Pal displays as 200.1 ml because each one-third pour is rounded to 66.7 ml.
The unrounded value is 66.666... ml per ingredient, for a true total of 200 ml.

## Catalog

| Recipe | Ingredient | Ratio Parts | Volume |
|---|---|---:|---:|
| California Negroni | St. George Gin | 6 | 85.7 ml |
| California Negroni | Antica Formula Vermouth | 5 | 71.4 ml |
| California Negroni | Bruto Americano | 3 | 42.9 ml |
| Pony Espresso Martini | Hanger One Vodka | 2 | 100.0 ml |
| Pony Espresso Martini | Kahlua | 1 | 50.0 ml |
| Pony Espresso Martini | Espresso | 1 | 50.0 ml |
| Old Pal | Michter's Rye | 1 | 66.7 ml |
| Old Pal | Antica Formula Vermouth | 1 | 66.7 ml |
| Old Pal | Bruto Americano | 1 | 66.7 ml |
| Mare-garita | Mescal | 6 | 92.3 ml |
| Mare-garita | Grand Marnier | 4 | 61.5 ml |
| Mare-garita | Sour mix | 3 | 46.2 ml |
| Moscow Mule | Hanger One Vodka | 2 | 57.1 ml |
| Moscow Mule | Ginger beer | 4 | 114.3 ml |
| Moscow Mule | Lime juice | 1 | 28.6 ml |
| Kentucky Derby Julep | Woodford Reserve | 4 | 160.0 ml |
| Kentucky Derby Julep | Syrup | 1 | 40.0 ml |

## Firmware Source

The firmware-facing recipe configuration lives at
`firmware/config/recipes.yaml`.

The YAML file should stay in sync with this document until firmware has a
validated config-loading path.
