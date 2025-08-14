import { IExecuteFunctions } from 'n8n-core';
import { INodeExecutionData, INodeType, INodeTypeDescription, INodeTypeBaseDescription, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import * as child_process from 'child_process';
import * as util from 'util';

export class Printer implements INodeType {
    description: INodeTypeDescription;

    constructor(baseDescription: INodeTypeBaseDescription) {
        this.description = {
                ...baseDescription,
			displayName: 'Printer',
			name: 'printer',
			icon: 'file:printer.svg', // the icon come from here : https://iconduck.com/icons/22273/print
			group: ['transform'],
			version: 1,
			description: 'Printer node works with CUPS',
			defaults: {
				name: 'printer',
			},
			inputs: ['main'],
			outputs: ['main'],
			properties: [
				{
  					displayName: 'This node required "cups-client" package.',
  					name: 'notice',
  					type: 'notice',
  					default: '',
				},
				{
  					displayName: `You might be encountering the 'Error - The printer or class does not exist' issue due to your network configuration (e.g., not being in the same LAN). The reverse resolution name of the printer needs to be added to CUPS (ServerName in /etc/cups/client.conf). Please follow the instructions in the README at https://github.com/DtNeo/n8n-printer-node.`,
  					name: 'notice',
  					type: 'notice',
  					default: '',
				},
				{
					displayName: 'CUPS IP (ServerName)',
					name: 'servername',
					default: 'servername',
					description: 'Enter the IP address of the CUPS server that handles the printer.Example: 192.168.1.100',
					type: 'string',
					required: true,
				},
				{
					displayName: 'File',
					name: 'file',
					default: 'file',
					description: 'Add the file to print /home/node/n8n/data/textfile.txt',
					type: 'string',
					required: true,
				},
				{
					displayName: 'Quantity',
					name: 'quantity',
					default: 1,
					description: 'Specify a quantity',
					type: 'number',
					required: true,
					typeOptions: {
						maxValue: 99,
						minValue: 1,
						numberStepSize: 1,
					},
				},
                {
                    displayName: 'Page Range',
                    name: 'pageRange',
                    type: 'string',
                    required: false,
                    default: '',
                    description: 'Enter the page range to print (e.g., "1-5" for pages 1 to 5). Empty for all pages',
                },
				{
					displayName: 'Select the Printer Discover',
					name: 'printers',
					type: 'resourceLocator',
					default: { mode: 'string', value: 'HP_LaserJet' },
					description: "First, you need a CUPS IP for discovery. Select a printer. If no printer is available, share a printer via your CUPS Manager at IP-CUPS:631.",
					modes: [
						{
							displayName: 'Address Printer',
							name: 'addressPrinter',
							type: 'string',
							hint: 'Enter the exact name of your printer. No space in the name',
						},
						{
							displayName: 'List of Printer Discover',
							name: 'list',
							type: 'list',
							typeOptions: {
								searchListMethod: 'searchPrinters',
								searchable: false,
								searchFilterRequired: false
							}
						},
					]
				},
			],
		};
	}
	
	methods = {
	    listSearch: {
	        async searchPrinters(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
		            const serverName = this.getNodeParameter('servername') as string;
		            const exec = util.promisify(child_process.exec);
		            const command = `lpstat -h ${serverName}:631 -p`;
		            const { stdout } = await exec(command);

		            const searchResults = stdout
		                .split('\n')
		                .filter(line => line.startsWith('printer '))
		                .map(line => line.split(' ')[1]);
		            return { results: searchResults.map(name => ({
		            	name,
		            	value: name
		            }))
		        };
	        },
	    }
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const exec = util.promisify(child_process.exec);
		let responseData: any;

		const printer = this.getNodeParameter('printers', 0, undefined, {extractValue: true}) as string;
		const file = this.getNodeParameter('file', 0) as string;
		const serverName = this.getNodeParameter('servername', 0) as string;
		const quantity = this.getNodeParameter('quantity', 0) as number;
		const pageRange = this.getNodeParameter('pageRange', 0) as string;
		const pageRangeOption = pageRange ? `-P ${pageRange}` : '';

		const command = `lp -d ${printer} -h ${serverName}:631 -n ${quantity} ${pageRangeOption} ${file}`;
		const { stdout } = await exec(command);

		responseData = { success: true, output: stdout };

		return [this.helpers.returnJsonArray(responseData)];
	}
}