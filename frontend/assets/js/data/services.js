export const DEFAULT_SERVICES = [
  {
    id: 'svc-web-dev',
    name: 'Website Development',
    category: 'Development',
    sac: '998314',
    gstRate: 18,
    unit: 'Project',
    defaultPrice: 40000,
    isRecurring: false,
    isAmcService: false,
    isActive: true
  },
  {
    id: 'svc-domain-hosting',
    name: 'Domain + Hosting Setup',
    category: 'Hosting',
    sac: '998315',
    gstRate: 18,
    unit: 'Year',
    defaultPrice: 10000,
    isRecurring: true,
    isAmcService: false,
    isActive: true
  },
  {
    id: 'svc-amc',
    name: 'Website AMC',
    category: 'Maintenance',
    sac: '998313',
    gstRate: 18,
    unit: 'Month',
    defaultPrice: 5000,
    isRecurring: true,
    isAmcService: true,
    isActive: true
  }
];
