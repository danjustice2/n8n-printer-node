import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';

import * as child_process from 'child_process';
import * as util from 'util';

export class Scanner implements INodeType {
	description: INodeTypeDescription = {
			displayName: 'Scanner',
			name: 'scanner',
			icon: 'file:scanner.svg',
			group: ['transform'],
			version: 1,
			description: 'Scans a document using a SANE-compatible scanner and returns a PDF',
			defaults: {
					name: 'Scanner',
			},
			inputs: [NodeConnectionType.Main],
			outputs: [NodeConnectionType.Main],
			properties: [
					{
							displayName: 'This node requires the "sane-utils" package (providing scanimage) to be installed in your n8n environment.',
							name: 'noticeSane',
							type: 'notice',
							default: '',
					},
					{
							displayName: 'Scanner Device',
							name: 'scanner',
							type: 'resourceLocator',
							default: { mode: 'list', value: '' },
							description: 'Select a scanner from the list or enter a device name manually',
							modes: [
									{
											displayName: 'List',
											name: 'list',
											type: 'list',
											typeOptions: {
													searchListMethod: 'searchScanners',
													searchable: true,
											},
									},
									{
											displayName: 'Name',
											name: 'name',
											type: 'string',
											hint: 'Enter the SANE device name (e.g., pixma:MX920_192.168.1.5 or bjnp://192.168.1.5)',
									},
							],
					},
					{
							displayName: 'Output Binary Property',
							name: 'outputProperty',
							type: 'string',
							default: 'data',
							required: true,
							description: 'Name of the binary property to write the scanned PDF into',
					},
					{
							displayName: 'Options',
							name: 'options',
							type: 'collection',
							placeholder: 'Add Option',
							default: {},
							options: [
									{
											displayName: 'Resolution',
											name: 'resolution',
											type: 'number',
											typeOptions: {
													minValue: 75,
											},
											default: 300,
											description: 'Scan resolution in DPI',
									},
									{
											displayName: 'Scan Mode',
											name: 'mode',
											type: 'options',
											options: [
													{ name: 'Color', value: 'Color' },
													{ name: 'Gray', value: 'Gray' },
													{ name: 'Lineart', value: 'Lineart' },
											],
											default: 'Color',
											description: 'Color mode for the scan',
									},
									{
											displayName: 'Source',
											name: 'source',
											type: 'options',
											options: [
													{ name: 'Flatbed', value: 'Flatbed' },
													{ name: 'ADF', value: 'ADF' },
											],
											default: 'Flatbed',
											description: 'Paper source to scan from',
									},
							],
					},
			],
	};

	methods = {
			listSearch: {
					async searchScanners(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
							try {
									const exec = util.promisify(child_process.exec);
									const { stdout } = await exec('scanimage -L');
									const lines = stdout.trim().split('\n').filter((line: string) => line);
									if (lines.length === 0) {
											return { results: [{ name: 'No Scanners Found', value: '' }] };
									}
									const results = lines.map((line: string) => {
											const match = line.match(/device `(.+?)' is a (.+)/);
											if (match) {
													return { name: match[2], value: match[1] };
											}
											return { name: line, value: line };
									});
									return { results };
							} catch (error) {
									const err = error as NodeJS.ErrnoException;
									if (err.code === 'ENOENT') {
											return { results: [{ name: 'Error: scanimage not found. Install sane-utils.', value: '' }] };
									}
									return { results: [{ name: `Error discovering scanners: ${err.message.split('\n')[0]}`, value: '' }] };
							}
					},
			},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
			const items = this.getInputData();
			const returnData: INodeExecutionData[] = [];

			for (let i = 0; i < items.length; i++) {
					try {
							const device = this.getNodeParameter('scanner', i, '', { extractValue: true }) as string;
							const outputProperty = this.getNodeParameter('outputProperty', i, 'data') as string;
							const options = this.getNodeParameter('options', i, {}) as {
									resolution?: number;
									mode?: string;
									source?: string;
							};

							const args = [
									'-d', device,
									'--format=pdf',
									`--resolution=${options.resolution ?? 300}`,
									`--mode=${options.mode ?? 'Color'}`,
									`--source=${options.source ?? 'Flatbed'}`,
							];

							const chunks: Buffer[] = [];
							let stderr = '';

							await new Promise<void>((resolve, reject) => {
									let scanProcess: child_process.ChildProcessWithoutNullStreams;
									try {
											scanProcess = child_process.spawn('scanimage', args);
									} catch (spawnErr) {
											const err = spawnErr as NodeJS.ErrnoException;
											if (err.code === 'ENOENT') {
													reject(new NodeOperationError(this.getNode(), 'scanimage not found. Install sane-utils in your n8n environment.'));
											} else {
													reject(spawnErr);
											}
											return;
									}

									scanProcess.stdout.on('data', (chunk: Buffer) => { chunks.push(chunk); });
									scanProcess.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

									scanProcess.on('error', (err: NodeJS.ErrnoException) => {
											if (err.code === 'ENOENT') {
													reject(new NodeOperationError(this.getNode(), 'scanimage not found. Install sane-utils in your n8n environment.'));
											} else {
													reject(err);
											}
									});

									scanProcess.on('close', async (code: number | null) => {
											if (code === 0) {
													const buffer = Buffer.concat(chunks);
													try {
															const binaryData = await this.helpers.prepareBinaryData(buffer, 'scan.pdf', 'application/pdf');
															returnData.push({
																	json: { success: true },
																	binary: { [outputProperty]: binaryData },
																	pairedItem: { item: i },
															});
															resolve();
													} catch (prepErr) {
															reject(prepErr);
													}
											} else {
													reject(new NodeOperationError(this.getNode(), `Scan failed with code ${code}: ${stderr.trim()}`));
											}
									});
							});

					} catch (error) {
							if (this.continueOnFail()) {
									returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
									continue;
							}
							throw error;
					}
			}

			return [returnData];
	}
}
