import { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class WorkiomApi implements ICredentialType {
	name = 'workiomApi';
	displayName = 'Workiom API';
	icon: Icon = { light: 'file:workiom.svg', dark: 'file:workiom.dark.svg' };
	documentationUrl = 'https://workiom.com';

	test: ICredentialTestRequest = {
		request: {
			url: '={{($credentials.baseUrl || "https://api.workiom.com").replace(/\\/$/, "") + "/api/services/app/Session/GetCurrentLoginInformations"}}',
			headers: {
				'X-Api-Key': '={{$credentials.accessToken}}',
			},
		},
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.workiom.com',
			description: 'Override only for testing/staging environments',
		},
	];
}
