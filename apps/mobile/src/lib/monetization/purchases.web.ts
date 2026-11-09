import type { PlanOption } from './state';

// En web no hay compras dentro de la app.
export async function initPurchases(): Promise<void> {}
export async function loadPlans(): Promise<PlanOption[]> {
  return [];
}
export async function buyPlan(_plan: PlanOption): Promise<boolean> {
  return false;
}
export async function restorePurchases(): Promise<boolean> {
  return false;
}
export async function manageSubscription(): Promise<void> {}
