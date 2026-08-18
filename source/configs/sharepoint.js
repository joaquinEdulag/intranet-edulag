import 'dotenv/config';

const siteId =
    process.env.M365_SHAREPOINT_SITE_ID?.trim();

const listId =
    process.env.M365_SHAREPOINT_LIST_ID?.trim();

const listName =
    process.env.M365_SHAREPOINT_LIST_NAME?.trim()
    || 'SolicitudesAutorizacion';

function requerirValor(valor, variable) {
    if (!valor) {
        throw new Error(
            `No se encontró ${variable}`
        );
    }

    return valor;
}

export const sharePointConfig = Object.freeze({
    siteId: requerirValor(
        siteId,
        'M365_SHAREPOINT_SITE_ID'
    ),
    listId: requerirValor(
        listId,
        'M365_SHAREPOINT_LIST_ID'
    ),
    listName
});

