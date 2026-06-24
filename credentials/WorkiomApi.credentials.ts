import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class WorkiomApi implements ICredentialType {
	name = 'workiomApi';
	displayName = 'Workiom API';
	icon: Icon = 'file:workiom.svg';
	documentationUrl = 'https://workiom.com';
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
