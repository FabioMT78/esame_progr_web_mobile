function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function row(label, value) {
  const group = element('div', 'contract-document-data-row');
  group.append(
    element('dt', null, label),
    element('dd', null, value || '—')
  );
  return group;
}

function partyText(person) {
  const parts = [
    person.nomeCompleto,
    person.dataNascita ? `nato/a il ${person.dataNascita}` : null,
    person.residenza ? `residente in ${person.residenza}` : null,
    person.codiceFiscale ? `codice fiscale ${person.codiceFiscale}` : null
  ].filter(Boolean);
  return parts.join(', ');
}

function tenantDocumentText(documento) {
  if (!documento) return '';
  const parts = [
    documento.tipo,
    documento.numero ? `n. ${documento.numero}` : null,
    documento.organoRilascio ? `rilasciato da ${documento.organoRilascio}` : null,
    documento.dataRilascio ? `il ${documento.dataRilascio}` : null,
    documento.dataScadenza ? `con scadenza ${documento.dataScadenza}` : null
  ].filter(Boolean);
  return parts.join(' ');
}

export function renderContrattoPreview(container, documentModel) {
  if (!(container instanceof Element)) {
    throw new TypeError('Container anteprima contratto non valido.');
  }

  container.replaceChildren();

  const documentElement = element('article', 'contract-document');

  const header = element('header', 'contract-document-header');
  header.append(
    element('h2', 'contract-document-title', documentModel.titolo),
    element('p', 'contract-document-subtitle', documentModel.sottotitolo)
  );
  documentElement.append(header);

  const parties = element('section', 'contract-document-intro');

  const landlord = element('p');
  landlord.append(
    element('strong', null, 'LOCATORE: '),
    document.createTextNode(partyText(documentModel.locatore))
  );

  const grants = element('p', 'contract-document-grants', 'CONCEDE IN LOCAZIONE A');

  const tenant = element('p');
  tenant.append(
    element('strong', null, 'CONDUTTORE: '),
    document.createTextNode(partyText(documentModel.conduttore))
  );
  const documento = tenantDocumentText(documentModel.conduttore.documento);
  if (documento) tenant.append(document.createTextNode(`, identificato mediante ${documento}`));

  const property = element('p');
  property.append(
    element('strong', null, 'IMMOBILE: '),
    document.createTextNode(documentModel.immobile.descrizione)
  );

  parties.append(landlord, grants, tenant, property);
  documentElement.append(parties);

  const contractData = element('dl', 'contract-document-data');
  contractData.append(
    row('Tipologia', documentModel.contratto.tipologia),
    row('Decorrenza', documentModel.contratto.dal),
    row('Scadenza', documentModel.contratto.al),
    row('Canone annuale', documentModel.contratto.canoneAnnuale),
    row('Canone mensile', documentModel.contratto.canoneMensile),
    row('Giorno pagamento', documentModel.contratto.giornoPagamento)
  );
  documentElement.append(contractData);

  documentElement.append(
    element(
      'p',
      'contract-document-preamble',
      'LA LOCAZIONE È REGOLATA DALLE SEGUENTI PATTUIZIONI:'
    )
  );

  const articles = element('section', 'contract-document-articles');
  for (const articolo of documentModel.articoli || []) {
    const article = element('article', 'contract-document-article');
    article.dataset.numArticolo = String(articolo.numArticolo);

    article.append(element('h3', null, articolo.titolo));
    if (articolo.sottotitolo) {
      article.append(element('p', 'contract-document-article-subtitle', articolo.sottotitolo));
    }
    article.append(element('p', 'contract-document-article-text', articolo.descrizione));
    articles.append(article);
  }
  documentElement.append(articles);

  const signatures = element('section', 'contract-document-signatures');
  const landlordSignature = element('div');
  landlordSignature.append(
    element('strong', null, 'IL LOCATORE'),
    element('span', 'contract-document-signature-line', ''),
    element('span', null, documentModel.locatore.nomeCompleto)
  );

  const tenantSignature = element('div');
  tenantSignature.append(
    element('strong', null, 'IL CONDUTTORE'),
    element('span', 'contract-document-signature-line', ''),
    element('span', null, documentModel.conduttore.nomeCompleto)
  );

  signatures.append(landlordSignature, tenantSignature);
  documentElement.append(signatures);

  container.append(documentElement);
}
