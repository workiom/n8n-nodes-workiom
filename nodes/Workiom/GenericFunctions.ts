import {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
} from 'n8n-workflow';

export type WorkiomContext = ILoadOptionsFunctions | IExecuteFunctions | IHookFunctions | IWebhookFunctions;

// Workiom FieldDataType enum (backend: Listure.Data.Shared.Field.FieldDataType)
export const FT = {
	Text: 0, Number: 1, DateTime: 2, Boolean: 3, StaticSelect: 4, LinkList: 5,
	User: 6, Website: 7, Email: 8, File: 9, PhoneNumber: 11, Count: 12,
	Currency: 13, AutoNumber: 14, CheckList: 15, Status: 16, MultiStaticSelect: 17,
	MultiUser: 18, ProgressBar: 19, Location: 20, Dependency: 21, Signature: 22,
} as const;

export async function getCredentials(context: WorkiomContext) {
	const credentials = await context.getCredentials('workiomApi');
	return {
		baseUrl: ((credentials.baseUrl as string) || 'https://api.workiom.com').replace(/\/$/, ''),
		token: credentials.accessToken as string,
	};
}

export async function fetchListFields(
	context: WorkiomContext,
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

export async function fetchUserOptions(
	context: WorkiomContext,
	baseUrl: string,
	token: string,
): Promise<INodePropertyOptions[]> {
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

const SYSTEM_FIELD_NAMES: Record<number, string> = {
	1: 'Creator',
	2: 'Creation Date',
	3: 'Last Updater',
	4: 'Last Modify Date',
	5: 'Last Activity Date',
};

export function getFieldName(field: IDataObject): string {
	const sft = field.systemFieldType as number;
	if (sft && SYSTEM_FIELD_NAMES[sft]) return SYSTEM_FIELD_NAMES[sft];
	return (field.name as string) ?? String(field.id);
}

function isParsableDate(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return false;
	const d = new Date(value as string | number);
	return !isNaN(d.getTime());
}

function resolveUserName(value: unknown, userOptions: INodePropertyOptions[]): string {
	if (value === null || value === undefined) return '';
	let lookup: unknown = value;
	if (typeof value === 'object') {
		// Workiom stores a user as { id, label } (label = display name); other
		// shapes carry the name under fullname/name/username. Take whichever is present.
		const v = value as IDataObject;
		const embedded = (v.fullname ?? v.name ?? v.username ?? v.label) as string | undefined;
		if (embedded) return embedded;
		lookup = v.id ?? v.value ?? '';
	}
	// userOptions values are stringified ids; compare type-tolerantly so a raw
	// numeric id in the record still matches. A bare name string matches u.name.
	const match = userOptions.find((u) => String(u.value) === String(lookup) || u.name === lookup);
	return match ? (match.name as string) : '';
}

function parseCheckList(value: unknown): Array<{ label: string; check: boolean }> {
	if (!value) return [];
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		if (!Array.isArray(parsed)) return [];
		return parsed.map((item: IDataObject) => ({ label: item.label as string, check: !!item.check }));
	} catch {
		return [];
	}
}

function transformFieldValue(dataType: number, value: unknown, userOptions: INodePropertyOptions[]): unknown {
	switch (dataType) {
		case FT.Number:
		case FT.Count:
		case FT.Currency:
		case FT.ProgressBar: {
			const n = parseFloat(value as string);
			return value !== null && value !== undefined && value !== '' && !isNaN(n) ? n : '';
		}
		case FT.DateTime:
			return isParsableDate(value) ? new Date(value as string).toISOString() : '';
		case FT.Boolean:
			return !!value;
		case FT.StaticSelect:
		case FT.Status:
			return (value as IDataObject)?.label ?? '';
		case FT.MultiStaticSelect:
		case FT.LinkList:
			return Array.isArray(value) ? value.map((item) => (item as IDataObject)?.label ?? '') : [];
		case FT.User:
			return resolveUserName(value, userOptions);
		case FT.MultiUser:
			return Array.isArray(value) ? value.map((item) => resolveUserName(item, userOptions)) : [];
		case FT.CheckList:
			return parseCheckList(value);
		case FT.File:
			return Array.isArray(value) ? value : [];
		default:
			return value ?? '';
	}
}

// Rewrite a record's keys from numeric field ids to field names, applying a
// per-dataType value transform (StaticSelect -> label, User -> name, etc).
// `_id` is exposed as `id`; per-view metadata (`view-*`) is dropped; keys with
// no matching field metadata pass through raw so no data is silently dropped.
export function transformRecordFields(
	row: IDataObject,
	fields: IDataObject[],
	userOptions: INodePropertyOptions[] = [],
): IDataObject {
	if (row == null || typeof row !== 'object') return row;

	const fieldById = new Map<string, { label: string; dataType: number }>();
	const seenNames = new Set<string>();
	for (const f of fields) {
		const id = String(f.id);
		let label = getFieldName(f);
		if (seenNames.has(label)) label = `${label} (${id})`;
		seenNames.add(label);
		fieldById.set(id, { label, dataType: f.dataType as number });
	}

	const out: IDataObject = {};
	for (const [key, rawValue] of Object.entries(row)) {
		if (key.startsWith('view-')) continue;
		if (key === '_id') {
			out.id = rawValue as IDataObject[string];
			continue;
		}
		const field = fieldById.get(key);
		if (!field) {
			out[key] = rawValue;
			continue;
		}
		out[field.label] = transformFieldValue(field.dataType, rawValue, userOptions) as IDataObject[string];
	}
	return out;
}
