export function errorText(error) {
  return error?.networkError
    ? 'Impossibile contattare il server. Riprova.'
    : error.message;
}

export function contextUrl(immobileId, inquilinoId) {
  const params = new URLSearchParams({ immobileId });
  if (inquilinoId) params.set('inquilinoId', inquilinoId);
  return `${inquilinoId ? '/contratto.html' : '/inquilino.html'}?${params}`;
}

function todayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadPropertyContext(api, signal, immobileId) {
  const params = new URLSearchParams({ immobileId });
  const [tenants, contracts] = await Promise.all([
    api(`/api/inquilini?${params}`, { signal }),
    api('/api/contratti', { signal })
  ]);
  signal.throwIfAborted();

  const propertyContracts = contracts.filter(
    (contract) => contract.immobile.id === immobileId
  );
  const today = todayDate();
  const activeContracts = propertyContracts.filter(
    (contract) => contract.dataInizio <= today && today <= contract.dataFine
  );
  const activeByTenant = new Map(
    activeContracts.map((contract) => [contract.inquilino.id, contract])
  );
  const paymentTenants = tenants.filter(
    (tenant) => activeByTenant.has(tenant.id)
  );

  return {
    tenants,
    activeByTenant,
    paymentTenants
  };
}
