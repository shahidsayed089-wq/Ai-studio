export const CREDIT_PACKAGES = Object.freeze([
  Object.freeze({
    id: 'starter',
    name: 'Starter',
    credits: 200,
    pricePaise: 34900,
    currency: 'INR',
    description: 'Short tests, Mini renders and prompt experiments.',
    popular: false,
  }),
  Object.freeze({
    id: 'creator',
    name: 'Creator',
    credits: 600,
    pricePaise: 89900,
    currency: 'INR',
    description: 'Built for regular creators and one substantial cinematic render.',
    popular: true,
  }),
  Object.freeze({
    id: 'pro',
    name: 'Pro',
    credits: 2000,
    pricePaise: 259900,
    currency: 'INR',
    description: 'Multiple campaign renders with a lower per-credit price.',
    popular: false,
  }),
  Object.freeze({
    id: 'studio',
    name: 'Studio',
    credits: 6000,
    pricePaise: 699900,
    currency: 'INR',
    description: 'High-volume production for teams and frequent releases.',
    popular: false,
  }),
]);

export function getCreditPackage(packageId) {
  return CREDIT_PACKAGES.find(item => item.id === packageId) || null;
}

export function publicCreditPackages() {
  return CREDIT_PACKAGES.map(item => ({
    ...item,
    priceRupees: item.pricePaise / 100,
    pricePerCredit: Math.round((item.pricePaise / item.credits)) / 100,
    unitDisclosure: '1 AI Studio credit = 1 Seedance2.ai API credit.',
  }));
}
