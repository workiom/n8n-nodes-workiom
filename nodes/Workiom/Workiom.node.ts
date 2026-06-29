import {
	FieldType,
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	ResourceMapperFields,
	ResourceMapperValue,
} from 'n8n-workflow';

const APP_MODES = [
	{
		displayName: 'From List',
		name: 'list',
		type: 'list' as const,
		placeholder: 'Select an app...',
		typeOptions: { searchListMethod: 'searchApps', searchable: true },
	},
	{
		displayName: 'By ID',
		name: 'id',
		type: 'string' as const,
		placeholder: 'e.g. 00000000-0000-0000-0000-000000000000',
	},
];

const LIST_MODES = [
	{
		displayName: 'From List',
		name: 'list',
		type: 'list' as const,
		placeholder: 'Select a list...',
		typeOptions: { searchListMethod: 'searchLists', searchable: true },
	},
	{
		displayName: 'By ID',
		name: 'id',
		type: 'string' as const,
		placeholder: 'e.g. 00000000-0000-0000-0000-000000000000',
	},
];

export class Workiom implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Workiom',
		name: 'workiom',
		icon: 'file:workiom.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and write data in Workiom',
		defaults: { name: 'Workiom' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'workiomApi', required: true, testedBy: 'testWorkiomCredentials' }],
		properties: [
			// ── Resource ──────────────────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'App', value: 'app' },
					{ name: 'List', value: 'list' },
					{ name: 'Record', value: 'record' },
				],
				default: 'record',
			},

			// ── App operations ────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['app'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get an app by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get all apps' },
				],
				default: 'getAll',
			},

			// ── List operations ───────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['list'] } },
				options: [
					{ name: 'Get', value: 'get', action: 'Get a list by ID' },
				],
				default: 'get',
			},

			// ── Record operations ─────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'] } },
				options: [
					{ name: 'Create', value: 'create', action: 'Create a record' },
					{ name: 'Delete', value: 'delete', action: 'Delete a record' },
					{ name: 'Get', value: 'get', action: 'Get a record by ID' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many records' },
					{ name: 'Update', value: 'update', action: 'Update a record (partial)' },
				],
				default: 'getAll',
			},

			// ── App selector — App/get only ───────────────────────────────────────
			{
				displayName: 'App',
				name: 'appId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['app'], operation: ['get'] } },
				modes: APP_MODES,
			},

			// ── App selector — List & Record ──────────────────────────────────────
			{
				displayName: 'App',
				name: 'appId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['list', 'record'] } },
				modes: APP_MODES,
			},

			// ── List selector — List/get only ─────────────────────────────────────
			{
				displayName: 'List',
				name: 'listId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['list'], operation: ['get'] } },
				modes: LIST_MODES,
			},

			// ── List selector — Record ────────────────────────────────────────────
			{
				displayName: 'List',
				name: 'listId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				displayOptions: { show: { resource: ['record'] } },
				modes: LIST_MODES,
			},

			// ── Record ID — get / update / delete ─────────────────────────────────
			{
				displayName: 'Record ID',
				name: 'recordId',
				type: 'string',
				required: true,
				displayOptions: { show: { resource: ['record'], operation: ['get', 'update', 'delete'] } },
				default: '',
			},

			// ── Record: create — typed field mapper ───────────────────────────────
			{
				displayName: 'Fields',
				name: 'fieldsCreate',
				type: 'resourceMapper',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'], operation: ['create'] } },
				default: { mappingMode: 'defineBelow', value: null },
				typeOptions: {
					loadOptionsDependsOn: ['listId'],
					resourceMapper: {
						resourceMapperMethod: 'getFieldsForCreate',
						mode: 'add',
						fieldWords: { singular: 'field', plural: 'fields' },
						addAllFields: true,
						supportAutoMap: false,
						noFieldsError: 'No editable fields found. Please select a list first.',
					},
				},
			},

			// ── Record: update — typed field mapper ───────────────────────────────
			{
				displayName: 'Fields',
				name: 'fieldsUpdate',
				type: 'resourceMapper',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'], operation: ['update'] } },
				default: { mappingMode: 'defineBelow', value: null },
				typeOptions: {
					loadOptionsDependsOn: ['listId', 'recordId'],
					resourceMapper: {
						resourceMapperMethod: 'getFieldsForUpdate',
						mode: 'add',
						fieldWords: { singular: 'field', plural: 'fields' },
						addAllFields: false,
						supportAutoMap: false,
						noFieldsError: 'No editable fields found. Please select a list first.',
					},
				},
			},

			// ── Record: getAll — pagination ───────────────────────────────────────
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 10000 },
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: 50,
				description: 'Max number of records to return (max 10 000)',
			},
			{
				displayName: 'Skip',
				name: 'skipCount',
				type: 'number',
				typeOptions: { minValue: 0 },
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: 0,
				description: 'Number of records to skip (for pagination)',
			},

			// ── Record: getAll — field projection ─────────────────────────────────
			{
				displayName: 'Fields to Return',
				name: 'projectedFields',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getListFieldIds',
					loadOptionsDependsOn: ['listId'],
				},
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: [],
				description: 'Fields to include in each record. Leave empty to return all fields.',
			},

			// ── Record: getAll — search & filters ─────────────────────────────────
			{
				displayName: 'Quick Search',
				name: 'quickSearch',
				type: 'string',
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: '',
				description: 'Search text across all fields',
				placeholder: 'e.g. Logistics',
			},
			{
				displayName: 'Filter Logic',
				name: 'filterCollectionOperator',
				type: 'options',
				options: [
					{ name: 'AND — all filters must match', value: 0 },
					{ name: 'OR — any filter can match', value: 1 },
				],
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: 0,
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				default: {},
				description: 'Filter records by field value',
				options: [
					{
						name: 'filter',
						displayName: 'Filter',
						values: [
							{
								displayName: 'Field',
								name: 'fieldId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getListFieldIds',
									loadOptionsDependsOn: ['listId'],
								},
								default: '',
								description: 'Field to filter by',
							},
							{
								displayName: 'Operator',
								name: 'operator',
								type: 'options',
								options: [
									{ name: 'Is', value: 3 },
									{ name: 'Is Not', value: 4 },
									{ name: 'Contains', value: 1 },
									{ name: 'Does Not Contain', value: 2 },
									{ name: 'Greater Than', value: 5 },
									{ name: 'Greater Than or Equal', value: 9 },
									{ name: 'Less Than', value: 6 },
									{ name: 'Less Than or Equal', value: 10 },
									{ name: 'Is Empty', value: 7 },
									{ name: 'Is Not Empty', value: 8 },
									{ name: 'In', value: 12 },
									{ name: 'Not In', value: 13 },
								],
								default: 3,
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'resourceLocator',
								default: { mode: 'value', value: '' },
								displayOptions: { hide: { operator: [7, 8] } },
								modes: [
									{
										// Custom mode name (not the reserved 'id'/'url'/'list'),
										// so n8n shows this displayName instead of a built-in label.
										displayName: 'By Value',
										name: 'value',
										type: 'string',
										placeholder: 'e.g. "Active", 42, true, 2024-01-01',
									},
									{
										displayName: 'From List',
										name: 'list',
										type: 'list',
										typeOptions: {
											searchListMethod: 'getFilterValueOptions',
											searchable: true,
										},
									},
								],
							},
						],
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async getFilterValueOptions(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const { baseUrl, token } = await getCredentials(this);
				const listId = this.getCurrentNodeParameter('listId', { extractValue: true }) as string;
				if (!listId) return { results: [] };

				// '&fieldId' resolves the sibling Field in the SAME fixedCollection row:
				// n8n rebuilds the path from the resource locator's own path
				// (parameters.filters.filter[N].value → filters.filter[N].fieldId).
				const rawId = this.getCurrentNodeParameter('&fieldId') ?? this.getCurrentNodeParameter('fieldId');
				const fieldId = rawId != null && rawId !== '' ? Number(rawId) : NaN;
				if (isNaN(fieldId)) return { results: [] };

				const allFields = await fetchListFields(this, baseUrl, token, listId);
				const field = allFields.find((f) => Number(f.id) === fieldId);
				if (!field) return { results: [] };

				const matches = (s: string) => !filter || s.toLowerCase().includes(filter.toLowerCase());
				const dt = field.dataType as number;

				if (dt === FT.User || dt === FT.MultiUser) {
					const users = await fetchUserOptions(this, baseUrl, token);
					return { results: users.filter((u) => matches(u.name as string)).map((u) => ({ name: u.name as string, value: String(u.value) })) };
				}

				if (dt === FT.StaticSelect || dt === FT.Status || dt === FT.MultiStaticSelect) {
					const choices = (field.staticListValues ?? []) as Array<{ id: string; label: string }>;
					return { results: choices.filter((c) => matches(c.label)).map((c) => ({ name: c.label, value: c.id })) };
				}

				if (dt === FT.LinkList && field.linkedListId) {
					const links = await fetchLinkOptions(this, baseUrl, token, field.linkedListId as string);
					return { results: links.filter((l) => matches(l.name as string)).map((l) => ({ name: l.name as string, value: String(l.value) })) };
				}

				return { results: [] };
			},

			async searchApps(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const { baseUrl, token } = await getCredentials(this);
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/api/services/app/Apps/GetAll`,
					headers: { 'X-Api-Key': token },
					json: true,
				});
				const items: IDataObject[] = ((response as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
				const results = items
					.filter((a) => !filter || (a.name as string).toLowerCase().includes(filter.toLowerCase()))
					.map((a) => ({ name: a.name as string, value: a.id as string }));
				return { results };
			},

			async searchLists(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const { baseUrl, token } = await getCredentials(this);
				const appId = this.getCurrentNodeParameter('appId', { extractValue: true }) as string;
				if (!appId) return { results: [] };
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}/api/services/app/Lists/GetAll`,
					headers: { 'X-Api-Key': token },
					json: true,
					qs: { appId },
				});
				const items: IDataObject[] = ((response as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
				const results = items
					.filter((l) => !filter || (l.name as string).toLowerCase().includes(filter.toLowerCase()))
					.map((l) => ({ name: l.name as string, value: l.id as string }));
				return { results };
			},
		},

		credentialTest: {
			async testWorkiomCredentials(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const data = credential.data as { accessToken?: string; baseUrl?: string };
				const token = data?.accessToken;
				const baseUrl = (data?.baseUrl || 'https://api.workiom.com').replace(/\/$/, '');

				if (!token) {
					return { status: 'Error', message: 'Access Token is required' };
				}

				try {
					const response = await this.helpers.request({
						method: 'GET',
						url: `${baseUrl}/api/services/app/Session/GetCurrentLoginInformations`,
						headers: { 'X-Api-Key': token },
						json: true,
					});

					const result = (response as IDataObject)?.result as IDataObject;
					const tenant = result?.tenant as IDataObject;
					const user = result?.user as IDataObject;

					if (!tenant) {
						return { status: 'Error', message: 'Invalid API key — could not retrieve account info' };
					}

					const tenantName = (tenant.name as string) || (tenant.tenancyName as string) || 'Unknown';
					const fullName = `${user?.name ?? ''} ${user?.surname ?? ''}`.trim()
						|| (user?.emailAddress as string)
						|| '';

					return {
						status: 'OK',
						message: `Connected to ${tenantName}${fullName ? ` as ${fullName}` : ''}`,
					};
				} catch (error) {
					return { status: 'Error', message: (error as Error).message };
				}
			},
		},

		loadOptions: {
			async getListFieldIds(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const { baseUrl, token } = await getCredentials(this);
				const listId = this.getCurrentNodeParameter('listId', { extractValue: true }) as string;
				if (!listId) return [];
				const fields = await fetchListFields(this, baseUrl, token, listId);
				return fields
					.filter((f) => !f.isDeleted && f.isVisible)
					.sort((a, b) => (a.order as number) - (b.order as number))
					.map((f) => ({ name: f.name as string, value: f.id as number }));
			},
		},

		resourceMapping: {
			async getFieldsForCreate(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				return getRecordFields(this, 'create');
			},
			async getFieldsForUpdate(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				return getRecordFields(this, 'update');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('workiomApi');
		const baseUrl = ((credentials.baseUrl as string) || 'https://api.workiom.com').replace(/\/$/, '');
		const token = credentials.accessToken as string;

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: unknown;

				// ── App ───────────────────────────────────────────────────────────
				if (resource === 'app') {
					if (operation === 'getAll') {
						const raw = await workiomRequest(this, token, baseUrl, 'GET', '/api/services/app/Apps/GetAll');
						result = unwrap(raw, true);
					} else if (operation === 'get') {
						const id = this.getNodeParameter('appId', i, '', { extractValue: true }) as string;
						const raw = await workiomRequest(this, token, baseUrl, 'GET', '/api/services/app/Apps/Get', undefined, { id });
						result = unwrap(raw, false);
						if (result && typeof result === 'object' && !Array.isArray(result)) {
							// Drop empty folders array — noise in the output.
							const folders = (result as IDataObject).folders;
							if (Array.isArray(folders) && folders.length === 0) delete (result as IDataObject).folders;
							// Apps/Get omits lists — fetch them separately and attach.
							const listsRaw = await workiomRequest(this, token, baseUrl, 'GET', '/api/services/app/Lists/GetAll', undefined, { appId: id });
							const lists = unwrap(listsRaw, true);
							const stripKeys = ['isVisible', 'views', 'fields', 'visibility', 'roleIds', 'defaultView', 'lastSyncDate'];
							const listTypeNames: Record<number, string> = { 0: 'Data', 1: 'Task', 2: 'Process' };
							(result as IDataObject).lists = (Array.isArray(lists) ? lists : []).map((list) => {
								if (list && typeof list === 'object') {
									for (const key of stripKeys) delete (list as IDataObject)[key];
									const lt = (list as IDataObject).listType;
									if (typeof lt === 'number' && lt in listTypeNames) (list as IDataObject).listType = listTypeNames[lt];
								}
								return list;
							}) as IDataObject[];
						}
					}

				// ── List ──────────────────────────────────────────────────────────
				} else if (resource === 'list') {
					if (operation === 'get') {
						const id = this.getNodeParameter('listId', i, '', { extractValue: true }) as string;
						const raw = await workiomRequest(this, token, baseUrl, 'GET', '/api/services/app/Lists/Get', undefined, { id, expand: ['views', 'fields'], includeSystemFields: true });
						result = unwrap(raw, false);
						// Strip verbose/internal fields from the list output — keep views and fields.
						if (result && typeof result === 'object' && !Array.isArray(result)) {
							for (const key of ['isVisible', 'visibility', 'roleIds', 'defaultView', 'lastSyncDate']) {
								delete (result as IDataObject)[key];
							}
							const viewTypeNames: Record<number, string> = {
								0: 'DataGrid', 1: 'KanbanBoard', 2: 'Form', 3: 'Calendar', 4: 'Timeline',
								5: 'ResourceAllocation', 6: 'Document', 7: 'Tree', 8: 'Map', 9: 'ListView',
								10: 'Gallery', 11: 'OrganizationChart', 12: 'GanttChart',
							};
							const sortingTypeNames: Record<number, string> = { 0: 'None', 1: 'Ascending', 2: 'Descending' };
							const views = (result as IDataObject).views;
							if (Array.isArray(views)) {
								for (const view of views) {
									if (!view || typeof view !== 'object') continue;
									const v = view as IDataObject;
									for (const key of ['state', 'accessibility', 'roleIds', 'recordLayoutId', 'conditionalColorFilters']) {
										delete v[key];
									}
									if (typeof v.viewType === 'number' && v.viewType in viewTypeNames) v.viewType = viewTypeNames[v.viewType];
									if (typeof v.groupingSorting === 'number' && v.groupingSorting in sortingTypeNames) v.groupingSorting = sortingTypeNames[v.groupingSorting];
									if (Array.isArray(v.filters)) {
										for (const filter of v.filters) {
											if (!filter || typeof filter !== 'object') continue;
											delete (filter as IDataObject).order;
										}
									}
								}
							}
							const fieldDataTypeNames: Record<number, string> = {
								0: 'Text', 1: 'Number', 2: 'DateTime', 3: 'Boolean', 4: 'StaticSelect', 5: 'LinkList',
								6: 'User', 7: 'Website', 8: 'Email', 9: 'File', 11: 'PhoneNumber', 12: 'Count',
								13: 'Currency', 14: 'AutoNumber', 15: 'CheckList', 16: 'Status', 17: 'MultiStaticSelect',
								18: 'MultiUser', 19: 'ProgressBar', 20: 'Location', 21: 'Dependency', 22: 'Signature',
							};
							const systemFieldTypeNames: Record<number, string> = {
								0: 'None', 1: 'Creator', 2: 'CreationDate', 3: 'LastUpdater', 4: 'LastModifyDate', 5: 'LastActivityDate',
							};
							const dateTypeNames: Record<number, string> = { 0: 'Date', 1: 'DateTime', 2: 'DateTimeUTC' };
							const fields = (result as IDataObject).fields;
							if (Array.isArray(fields)) {
								for (const field of fields) {
									if (!field || typeof field !== 'object') continue;
									const f = field as IDataObject;
									delete f.order;
									for (const key of ['staticListValues', 'filters', 'customFileExtensions']) {
										if (Array.isArray(f[key]) && (f[key] as unknown[]).length === 0) delete f[key];
									}
									if (typeof f.dataType === 'number' && f.dataType in fieldDataTypeNames) f.dataType = fieldDataTypeNames[f.dataType];
									if (typeof f.systemFieldType === 'number' && f.systemFieldType in systemFieldTypeNames) f.systemFieldType = systemFieldTypeNames[f.systemFieldType];
									if (typeof f.dateType === 'number' && f.dateType in dateTypeNames) f.dateType = dateTypeNames[f.dateType];
								}
							}
						}
					}

				// ── Record ────────────────────────────────────────────────────────
				} else if (resource === 'record') {
					const listId = this.getNodeParameter('listId', i, '', { extractValue: true }) as string;

					if (operation === 'getAll') {
						const limit = this.getNodeParameter('limit', i) as number;
						const skipCount = this.getNodeParameter('skipCount', i) as number;
						const quickSearch = (this.getNodeParameter('quickSearch', i, '') as string).trim();
						const projectedFields = (this.getNodeParameter('projectedFields', i, []) as Array<string | number>)
							.map((id) => Number(id))
							.filter((id) => !isNaN(id));
						const filterOp = this.getNodeParameter('filterCollectionOperator', i, 0) as number;
						const filterEntries = (this.getNodeParameter('filters.filter', i, []) as Array<{
							fieldId: number;
							operator: number;
							value: { mode: string; value: string } | string;
						}>);

						// Look up each filter field's data type so "Enter Value" strings can be
						// coerced to the right JSON type (number, boolean, …) the API expects.
						let typeByFieldId: Record<number, number> = {};
						if (filterEntries.length > 0) {
							const fields = await fetchListFields(this, baseUrl, token, listId);
							typeByFieldId = Object.fromEntries(
								fields.map((f) => [Number(f.id), f.dataType as number]),
							);
						}

						const filter = filterEntries.map((entry) => {
							const { fieldId, operator } = entry;
							const noValue = operator === 7 || operator === 8;
							const raw = typeof entry.value === 'string' ? entry.value : entry.value?.value ?? null;
							const value = noValue ? null : coerceFilterValue(raw, typeByFieldId[Number(fieldId)]);
							return { fieldId, operator, value, value2: null, valueMappingType: 0 };
						});

						const body: IDataObject = {
							listId,
							maxResultCount: limit,
							skipCount,
							...(quickSearch ? { quickSearch } : {}),
							...(projectedFields.length > 0 ? { projectedFields } : {}),
							...(filter.length > 0 ? { filter, filterCollectionOperator: filterOp } : {}),
						};
						const raw = await workiomRequest(this, token, baseUrl, 'POST', '/api/services/app/Data/All', body);
						result = unwrap(raw, true);
					} else if (operation === 'get') {
						const id = this.getNodeParameter('recordId', i) as string;
						const raw = await workiomRequest(this, token, baseUrl, 'GET', '/api/services/app/Data/Get', undefined, { listId, id });
						result = unwrap(raw, false);
					} else if (operation === 'create') {
						const mapper = this.getNodeParameter('fieldsCreate', i) as ResourceMapperValue;
						const body = extractMapperBody(mapper);
						const raw = await workiomRequest(this, token, baseUrl, 'POST', '/api/services/app/Data/Create', body, { listId });
						result = unwrap(raw, false);
					} else if (operation === 'update') {
						const id = this.getNodeParameter('recordId', i) as string;
						const mapper = this.getNodeParameter('fieldsUpdate', i) as ResourceMapperValue;
						const body = extractMapperBody(mapper);
						const raw = await workiomRequest(this, token, baseUrl, 'PUT', '/api/services/app/Data/UpdatePartial', body, { listId, id });
						result = unwrap(raw, false);
					} else if (operation === 'delete') {
						const id = this.getNodeParameter('recordId', i) as string;
						const raw = await workiomRequest(this, token, baseUrl, 'DELETE', '/api/services/app/Data/Delete', undefined, { listId, id });
						const deleted = unwrap(raw, false);
						result = deleted && typeof deleted === 'object' ? deleted : { success: true, id };
					}

					if (result != null) {
						const fields = await fetchListFields(this, baseUrl, token, listId, true);
						const idToName = buildFieldNameMap(fields);
						result = Array.isArray(result)
							? result.map((r) => renameRecordKeys(r as IDataObject, idToName))
							: renameRecordKeys(result as IDataObject, idToName);
					}
				}

				const outputs = Array.isArray(result) ? result : [result];
				for (const item of outputs) {
					returnData.push({ json: item as IDataObject, pairedItem: i });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: i });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCredentials(context: ILoadOptionsFunctions) {
	const credentials = await context.getCredentials('workiomApi');
	return {
		baseUrl: ((credentials.baseUrl as string) || 'https://api.workiom.com').replace(/\/$/, ''),
		token: credentials.accessToken as string,
	};
}

// Workiom FieldDataType enum (backend: Listure.Data.Shared.Field.FieldDataType)
const FT = {
	Text: 0, Number: 1, DateTime: 2, Boolean: 3, StaticSelect: 4, LinkList: 5,
	User: 6, Website: 7, Email: 8, File: 9, PhoneNumber: 11, Count: 12,
	Currency: 13, AutoNumber: 14, CheckList: 15, Status: 16, MultiStaticSelect: 17,
	MultiUser: 18, ProgressBar: 19, Location: 20, Dependency: 21, Signature: 22,
} as const;

async function getRecordFields(context: ILoadOptionsFunctions, mode: 'create' | 'update'): Promise<ResourceMapperFields> {
	const { baseUrl, token } = await getCredentials(context);
	const listId = context.getCurrentNodeParameter('listId', { extractValue: true }) as string;
	if (!listId) return { fields: [] };

	const rawFields = await fetchListFields(context, baseUrl, token, listId);

	// Drop fields the API will reject on write: system, deleted, read-only,
	// computed, lookup, rollup, and auto-generated (AutoNumber).
	const editable = rawFields
		.filter(
			(f) =>
				f.isVisible !== false &&
				!f.isSystemField &&
				!f.isDeleted &&
				!f.isReadOnly &&
				!f.isReadOnlyField &&
				!f.isComputed &&
				!f.isLookup &&
				!f.isVLookup &&
				!f.isRollup &&
				f.dataType !== FT.AutoNumber,
		)
		.sort((a, b) => (a.order as number) - (b.order as number));

	// Pre-fetch users (once) and every Linked List field's records concurrently.
	const needsUsers = editable.some((f) => f.dataType === FT.User || f.dataType === FT.MultiUser);
	const linkFields = editable.filter((f) => f.dataType === FT.LinkList && f.linkedListId);

	// Dedupe target lists — several link fields often point at the same list.
	const uniqueTargets = [...new Set(linkFields.map((f) => f.linkedListId as string))];

	const [userOptions, ...targetResults] = await Promise.all([
		needsUsers ? fetchUserOptions(context, baseUrl, token) : Promise.resolve([] as INodePropertyOptions[]),
		...uniqueTargets.map((t) => fetchLinkOptions(context, baseUrl, token, t)),
	]);

	const optionsByTarget: Record<string, INodePropertyOptions[]> = {};
	uniqueTargets.forEach((t, idx) => {
		optionsByTarget[t] = targetResults[idx] ?? [];
	});

	const linkOptionsByField: Record<string, INodePropertyOptions[]> = {};
	for (const f of linkFields) {
		linkOptionsByField[String(f.id)] = optionsByTarget[f.linkedListId as string] ?? [];
	}

	return {
		fields: editable.map((f) => {
			const { fieldType, options } = resolveFieldType(f, userOptions, linkOptionsByField[String(f.id)] ?? []);

			return {
				// Workiom's Data/Create keys values by NUMERIC field id, not name.
				id: String(f.id),
				displayName: f.name as string,
				required: mode === 'create' ? !!f.isRequired : false,
				display: true,
				defaultMatch: false,
				type: fieldType,
				options: options.length > 0 ? options : undefined,
			};
		}),
	};
}


function resolveFieldType(
	field: IDataObject,
	userOptions: INodePropertyOptions[],
	linkOptions: INodePropertyOptions[],
): { fieldType: FieldType; options: INodePropertyOptions[] } {
	switch (field.dataType as number) {
		case FT.Number:
		case FT.Count:
		case FT.Currency:
		case FT.ProgressBar:
			return { fieldType: 'number', options: [] };

		case FT.DateTime:
			return { fieldType: 'dateTime', options: [] };

		case FT.Boolean:
			return { fieldType: 'boolean', options: [] };

		case FT.StaticSelect:
		case FT.Status:
		case FT.MultiStaticSelect: {
			// Value sent = option id (GUID); the backend also accepts the label.
			const choices = (field.staticListValues ?? []) as Array<{ id: string; label: string }>;
			const options = choices.map((c) => ({ name: c.label, value: c.id }));
			return options.length > 0 ? { fieldType: 'options', options } : { fieldType: 'string', options: [] };
		}

		case FT.User:
		case FT.MultiUser:
			// Value sent = numeric user id.
			return userOptions.length > 0 ? { fieldType: 'options', options: userOptions } : { fieldType: 'string', options: [] };

		case FT.LinkList:
			// Value sent = target record _id (Mongo ObjectId).
			return linkOptions.length > 0 ? { fieldType: 'options', options: linkOptions } : { fieldType: 'string', options: [] };

		default:
			// Text, Website, Email, Phone, File, CheckList, Location, Dependency, Signature → free text / JSON
			return { fieldType: 'string', options: [] };
	}
}

async function fetchListFields(
	context: ILoadOptionsFunctions | IExecuteFunctions,
	baseUrl: string,
	token: string,
	listId: string,
	includeSystemFields = false,
): Promise<IDataObject[]> {
	const response = await context.helpers.httpRequest({
		method: 'GET',
		url: `${baseUrl}/api/services/app/Lists/Get`,
		headers: { 'X-Api-Key': token },
		json: true,
		qs: { id: listId, expand: 'fields', ...(includeSystemFields ? { includeSystemFields: true } : {}) },
	});
	return ((response as IDataObject)?.result as IDataObject)?.fields as IDataObject[] ?? [];
}

async function fetchUserOptions(context: ILoadOptionsFunctions, baseUrl: string, token: string): Promise<INodePropertyOptions[]> {
	try {
		// CommonLookup/FindUsers only requires authentication (no invite-members
		// permission) and returns NameValueDto { name: fullName, value: userId }.
		const res = await context.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/api/services/app/CommonLookup/FindUsers`,
			headers: { 'X-Api-Key': token },
			json: true,
			body: { maxResultCount: 1000, skipCount: 0, filter: '' },
		});
		const users: IDataObject[] = ((res as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
		return users.map((u) => ({
			name: (u.name as string) || String(u.value),
			value: String(u.value),
		}));
	} catch {
		// On failure the field falls back to a text box — the backend still
		// resolves a typed full name to a user on write.
		return [];
	}
}

async function fetchLinkOptions(
	context: ILoadOptionsFunctions,
	baseUrl: string,
	token: string,
	targetListId: string,
): Promise<INodePropertyOptions[]> {
	try {
		// Find the primary field of the target list — its value is the record's display name.
		const targetFields = await fetchListFields(context, baseUrl, token, targetListId);
		const primary = targetFields.find((f) => f.isPrimary) ?? targetFields.find((f) => f.dataType === FT.Text);
		const primaryId = primary ? String(primary.id) : undefined;

		const res = await context.helpers.httpRequest({
			method: 'POST',
			url: `${baseUrl}/api/services/app/Data/All`,
			headers: { 'X-Api-Key': token },
			json: true,
			body: {
				listId: targetListId,
				maxResultCount: 200,
				skipCount: 0,
				...(primaryId ? { projectedFields: [Number(primaryId)] } : {}),
			},
		});
		const records: IDataObject[] = ((res as IDataObject)?.result as IDataObject)?.items as IDataObject[] ?? [];
		return records.map((r) => ({
			name: (primaryId && r[primaryId] != null ? String(r[primaryId]) : String(r._id)),
			value: String(r._id),
		}));
	} catch {
		// Target records unavailable → Linked List degrades to free-text record-id entry.
		return [];
	}
}

const SYSTEM_FIELD_NAMES: Record<number, string> = {
	1: 'Creator',
	2: 'Creation Date',
	3: 'Last Updater',
	4: 'Last Modify Date',
	5: 'Last Activity Date',
};

function getFieldName(field: IDataObject): string {
	const sft = field.systemFieldType as number;
	if (sft && SYSTEM_FIELD_NAMES[sft]) return SYSTEM_FIELD_NAMES[sft];
	return (field.name as string) ?? String(field.id);
}

// Map numeric field id → field name. On duplicate names, keep the id suffixed
// so no field value is silently dropped.
function buildFieldNameMap(fields: IDataObject[]): Record<string, string> {
	const map: Record<string, string> = {};
	const seen = new Set<string>();
	for (const f of fields) {
		const id = String(f.id);
		let name = getFieldName(f);
		if (seen.has(name)) name = `${name} (${id})`;
		seen.add(name);
		map[id] = name;
	}
	return map;
}

// Rewrite a record's keys from numeric field ids to field names.
// `_id` is exposed as `id`; other unmapped keys (system metadata) pass through unchanged.
function renameRecordKeys(record: IDataObject, idToName: Record<string, string>): IDataObject {
	if (record == null || typeof record !== 'object') return record;
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(record)) {
		// Drop per-view ordering metadata (e.g. view-630460) — not record data.
		if (key.startsWith('view-')) continue;
		const mapped = key === '_id' ? 'id' : (idToName[key] ?? key);
		out[mapped] = value;
	}
	return out;
}

function extractMapperBody(mapper: ResourceMapperValue): IDataObject {
	const body: IDataObject = {};
	for (const [key, value] of Object.entries(mapper.value ?? {})) {
		// Keys are numeric field ids; values are option ids / user ids / record
		// ids / native scalars. The backend tolerates a single value for
		// multi-value fields, so no client-side array wrapping is needed.
		if (value !== null && value !== undefined && value !== '') body[key] = value as IDataObject[string];
	}
	return body;
}

// Coerce a string filter value (from the "Enter Value" resource-locator mode)
// into the JSON type the Workiom API expects for the field's data type.
// Dropdown picks (User / Select / Linked) already carry the right id string.
function coerceFilterValue(raw: unknown, dataType: number | undefined): unknown {
	if (raw === null || raw === undefined || raw === '') return null;
	if (typeof raw !== 'string') return raw;
	const s = raw.trim();

	switch (dataType) {
		case FT.Number:
		case FT.Count:
		case FT.Currency:
		case FT.ProgressBar: {
			const n = Number(s);
			return isNaN(n) ? s : n;
		}
		case FT.Boolean: {
			const t = s.toLowerCase();
			if (['true', '1', 'yes', 'y'].includes(t)) return true;
			if (['false', '0', 'no', 'n'].includes(t)) return false;
			return s;
		}
		default:
			// Text, DateTime (ISO string), Select/User/Linked ids, etc. → as-is.
			return s;
	}
}

async function workiomRequest(
	context: IExecuteFunctions,
	token: string,
	baseUrl: string,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<unknown> {
	return context.helpers.httpRequest({
		method,
		url: `${baseUrl}${path}`,
		headers: { 'X-Api-Key': token },
		json: true,
		body: body && method !== 'GET' && method !== 'DELETE' ? body : undefined,
		qs: qs ?? {},
	});
}

// ABP wraps responses in { result: ..., success: true }
function unwrap(response: unknown, isList: boolean): unknown {
	const r = (response as Record<string, unknown>)?.result ?? response;
	if (isList) return (r as Record<string, unknown>)?.items ?? r;
	return r;
}
