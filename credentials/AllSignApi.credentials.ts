import type {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class AllSignApi implements ICredentialType {
    name = 'allSignApi';
    displayName = 'AllSign API';
    documentationUrl = 'https://docs.allsign.io';
    icon = {
        light: 'file:allsign.svg',
        dark: 'file:allsign.svg',
    } as const;
    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            placeholder: 'allsign_live_sk_...',
            description: 'Your AllSign API Key. Visit your <a href="https://dashboard.allsign.io/developers/api-keys">AllSign Dashboard</a> to generate a key.',
        },
        {
            displayName: 'Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'https://api.allsign.io',
            placeholder: 'https://api.allsign.io',
            description: 'AllSign API base URL. Use https://api.allsign.io for production or your custom development URL.',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '=Bearer {{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.baseUrl || "https://api.allsign.io"}}',
            url: '/v3/documents?limit=1',
            method: 'GET',
        },
    };
}
