import 'dotenv/config';

import {
    ConfidentialClientApplication
} from '@azure/msal-node';

const tenantId =
    process.env.MICROSOFT_TENANT_ID?.trim();

const clientId =
    process.env.MICROSOFT_CLIENT_ID?.trim();

const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET?.trim();

if (!tenantId) {
    throw new Error(
        'No se encontró MICROSOFT_TENANT_ID'
    );
}

if (!clientId) {
    throw new Error(
        'No se encontró MICROSOFT_CLIENT_ID'
    );
}

if (!clientSecret) {
    throw new Error(
        'No se encontró MICROSOFT_CLIENT_SECRET'
    );
}

const msalClient =
    new ConfidentialClientApplication({
        auth: {
            clientId,
            authority:
                `https://login.microsoftonline.com/${tenantId}`,
            clientSecret
        }
    });

export async function obtenerTokenGraph() {
    const resultado =
        await msalClient.acquireTokenByClientCredential({
            scopes: [
                'https://graph.microsoft.com/.default'
            ]
        });

    if (!resultado?.accessToken) {
        throw new Error(
            'Microsoft no devolvió un token de acceso'
        );
    }

    return resultado.accessToken;
}