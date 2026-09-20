const requiredCadastralFields = [
  'codiceComunale',
  'foglio',
  'particella',
  'subalterno',
  'categoria',
  'rendita'
];

const requiredTenantAnagrafica = [
  'nome',
  'cognome',
  'codiceFiscale',
  'dataNascita'
];

const requiredTenantAddress = [
  'indirizzo',
  'civico',
  'cap',
  'provincia',
  'comune'
];

const requiredTenantDocument = [
  'tipoDocumento',
  'numeroDocumento',
  'organoRilascioDocumento',
  'dataRilascioDocumento',
  'dataScadenzaDocumento'
];

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasRequiredCadastralData(immobile) {
  const data = immobile?.datiCatastali;
  return Boolean(data && typeof data === 'object'
    && requiredCadastralFields.every((name) => present(data[name])));
}

function hasCompleteAnagrafica(inquilino) {
  return Boolean(inquilino
    && requiredTenantAnagrafica.every((name) => present(inquilino[name])));
}

function hasCompleteAddress(inquilino) {
  return Boolean(inquilino
    && requiredTenantAddress.every((name) => present(inquilino[name])));
}

function hasCompleteDocument(inquilino) {
  return Boolean(inquilino
    && requiredTenantDocument.every((name) => present(inquilino[name])));
}

function hasCompleteTenantData(inquilino) {
  return hasCompleteAnagrafica(inquilino)
    && hasCompleteAddress(inquilino)
    && hasCompleteDocument(inquilino);
}

module.exports = {
  requiredCadastralFields,
  requiredTenantAnagrafica,
  requiredTenantAddress,
  requiredTenantDocument,
  hasRequiredCadastralData,
  hasCompleteAnagrafica,
  hasCompleteAddress,
  hasCompleteDocument,
  hasCompleteTenantData
};
