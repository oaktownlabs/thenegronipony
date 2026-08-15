import type { RecipePrediction } from './types';

interface RecipeCardProps {
  recipe: RecipePrediction;
  index: number;
}

const seconds = (milliseconds: number | null) =>
  milliseconds === null ? '—' : `${(milliseconds / 1_000).toFixed(1)} s`;
const compactId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—';

export function RecipeCard({ recipe, index }: RecipeCardProps) {
  return (
    <article className="recipe-card">
      <div className="recipe-card__number">{String(index + 1).padStart(2, '0')}</div>
      <div className="recipe-card__title">
        <h3>{recipe.name}</h3>
        <p>{recipe.ingredients.map((ingredient) => ingredient.name).join(' · ')}</p>
      </div>
      <div className="recipe-card__results">
        {recipe.specimenResults.map((result, resultIndex) => {
          const limitingIngredient = recipe.ingredients.find(
            (ingredient) => ingredient.ingredientId === result.limitingIngredientId,
          );
          return (
            <div key={`${recipe.recipeId}-${result.pumpModelId}`}>
              <small>{resultIndex === 0 ? 'KAMOER' : 'GIKFUN'}</small>
              <strong>{seconds(result.durationMs)}</strong>
              <span>
                {result.durationMs === null
                  ? (result.missingReason?.replaceAll('_', ' ') ?? 'awaiting curve')
                  : `${result.estimateClass?.replaceAll('_', ' ')} · ±${seconds(result.uncertaintyMs)}`}
              </span>
              <span
                title={`Specimen ${result.specimenId ?? 'none'}; curves ${result.curveIds.join(', ') || 'none'}; limiting ingredient ${limitingIngredient?.name ?? 'none'}`}
              >
                UNIT {compactId(result.specimenId)} · CURVE {compactId(result.curveIds[0])} · LIMIT{' '}
                {limitingIngredient?.name ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
