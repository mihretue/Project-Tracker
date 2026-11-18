/** Mirrors the API's money rule: NUMERIC(14,2), i.e. up to 12 digits before and 2 after the decimal point. */
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** Client-side check for project name and ETB budget; the server remains the authority. */
export function validateProjectInput(name: string, budget: string): string | null {
  if (name.trim() === '') return 'Project name is required.';
  if (name.trim().length > 200) return 'Project name must be 200 characters or fewer.';
  if (!MONEY.test(budget.trim())) {
    return 'Budget must be a non-negative amount with at most 12 digits and 2 decimal places (e.g. 150000.00).';
  }
  return null;
}

/** Client-side check for task title and ETB estimated cost; the server remains the authority. */
export function validateTaskInput(title: string, cost: string): string | null {
  if (title.trim() === '') return 'Task title is required.';
  if (title.trim().length > 250) return 'Task title must be 250 characters or fewer.';
  if (!MONEY.test(cost.trim())) {
    return 'Estimated cost must be a non-negative amount with at most 12 digits and 2 decimal places (e.g. 25000.00).';
  }
  return null;
}
