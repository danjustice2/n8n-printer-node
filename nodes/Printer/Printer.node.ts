import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	NodeOperationError,
} from 'n8n-workflow';

import * as child_process from 'child_process';
import * as util from 'util';

export class Printer implements INodeType {
	description: INodeTypeDescription = {
			displayName: 'Printer',
			name: 'printer',
			icon: 'file:printer.svg',
			group: ['transform'],
			version: 1,
			description: 'Sends a binary file to a CUPS printer',
			defaults: {
					name: 'Printer',
			},
			inputs: ['main'],
			outputs: ['main'],
			properties: [
					{
							displayName: 'This node requires the "cups-client" package to be installed in your n8n environment.',
							name: 'noticeCups',
							type: 'notice',
							default: '',
					},
					{
							displayName: `If you encounter 'The printer or class does not exist' error, you may need to configure your CUPS client. See the README for instructions.`,
							name: 'noticeServerName',
							type: 'notice',
							default: '',
					},
					{
							displayName: 'CUPS Server IP',
							name: 'serverName',
							type: 'string',
							required: true,
							default: '192.168.1.100',
							description: 'The IP address of the CUPS server that manages the printer',
					},
					{
							displayName: 'Select Printer',
							name: 'printer',
							type: 'resourceLocator',
							default: { mode: 'list', value: '' },
							description: 'Select a printer from the list discovered on your CUPS server',
							modes: [
									{
											displayName: 'List',
											name: 'list',
											type: 'list',
											typeOptions: {
													searchListMethod: 'searchPrinters',
													searchable: true,
											}
									},
									{
											displayName: 'Name',
											name: 'name',
											type: 'string',
											hint: 'Enter the exact name of your printer queue (e.g., HP_LaserJet_Pro)',
									},
							]
					},
					{
							displayName: 'Binary Property',
							name: 'binaryPropertyName',
							type: 'string',
							default: 'data',
							required: true,
							description: 'Name of the binary property which contains the file to print',
					},
					{
							displayName: 'Options',
							name: 'options',
							type: 'collection',
							placeholder: 'Add Option',
							default: {},
							options: [
									{
											displayName: 'Quantity',
											name: 'quantity',
											type: 'number',
											typeOptions: {
													minValue: 1,
											},
											default: 1,
											description: 'Number of copies to print',
									},
									{
											displayName: 'Page Range',
											name: 'pageRange',
											type: 'string',
											default: '',
											placeholder: '1-5,8,10-12',
											description: 'Specify which pages to print (e.g., 1-5, 8, 10-12)',
									},
									{
											displayName: 'Advanced CUPS Options',
											name: 'advancedOptions',
											type: 'json',
											default: '',
											placeholder: '{\n    "media": "A4",\n    "sides": "two-sided-long-edge"\n}',
											description: 'Enter a JSON object of advanced CUPS options. Each key-value pair will be converted to a `-o key=value` argument.',
											typeOptions: {
													alwaysOpen: true,
											}
									},
							],
					},
			],
	};

	methods = {
			listSearch: {
					async searchPrinters(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
							try {
									const serverName = this.getNodeParameter('serverName') as string;
									if (!serverName) { return { results: [{ name: 'Please Enter a CUPS Server IP First', value: '' }] }; }
									const exec = util.promisify(child_process.exec);
									const command = `lpstat -h ${serverName}:631 -p | awk '{print $2}'`;
									const { stdout } = await exec(command);
									const printerNames = stdout.trim().split('\n').filter((name: string) => name);
									if (printerNames.length === 0) { return { results: [{ name: 'No Printers Found on Server', value: '' }] }; }
									return { results: printerNames.map((name: string) => ({ name, value: name })) };
							} catch (error) {
									return { results: [ { name: `Error discovering printers: ${(error as Error).message.split('\n')[0]}`, value: '' } ] };
							}
					},
			}
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
			const items = this.getInputData();
			const returnData: INodeExecutionData[] = [];

			for (let i = 0; i < items.length; i++) {
					try {
							const printer = this.getNodeParameter('printer', i, '', { extractValue: true }) as string;
							const serverName = this.getNodeParameter('serverName', i) as string;
							const options = this.getNodeParameter('options', i, {}) as { quantity?: number; pageRange?: string; advancedOptions?: string; };
							const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;

							const fileBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

							const args = [ '-d', printer, '-h', `${serverName}:631` ];

							if (options.quantity && options.quantity > 0) {
									args.push('-n', options.quantity.toString());
							}
							if (options.pageRange) {
									args.push('-o', `page-ranges=${options.pageRange}`);
							}

							if (options.advancedOptions) {
									try {
											const advancedOpts = JSON.parse(options.advancedOptions);
											for (const key in advancedOpts) {
													if (Object.prototype.hasOwnProperty.call(advancedOpts, key)) {
															args.push('-o', `${key}=${advancedOpts[key]}`);
													}
											}
									} catch (e) {
										throw new NodeOperationError(this.getNode(), `Advanced CUPS Options field does not contain valid JSON: ${(e as Error).message}`);
									}
							}

							const lpProcess = child_process.spawn('lp', args);

							lpProcess.stdin.write(fileBuffer);
							lpProcess.stdin.end();

							let stdout = '';
							let stderr = '';

							lpProcess.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
							lpProcess.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

							await new Promise<void>((resolve, reject) => {
									lpProcess.on('close', (code: number | null) => {
											if (code === 0) {
													returnData.push({ json: { success: true, output: stdout.trim() }, pairedItem: { item: i } });
													resolve();
											} else {
													reject(new Error(`Print command failed with code ${code}: ${stderr.trim()}`));
											}
									});
									lpProcess.on('error', (err: Error) => reject(err));
							});

					} catch (error) {
							if (this.continueOnFail()) {
									returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
									continue;
							}
							throw error;
					}
			}

			return [this.helpers.returnJsonArray(returnData)];
	}
}
