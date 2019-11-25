'use babel';

import { el, list, mount, setAttr } from 'redom';
import glob from 'glob';
import util from 'util';
const { spawn } = require('child_process');

class FeedbackPane {

	constructor(serializedState) {
		// Create root element
		this.rootElement = el('div.atom-cyto-message', "here, baby");
		mount(document.body, this.rootElement);

		this.modalPanel = atom.workspace.addModalPanel({
			item: this.rootElement,
			visible: true
		});
	}

	setMessage(data) {
		this.rootElement.textContent = data;
	}

	isVisible() {this.modalPanel.isVisible()}
	show() {this.modalPanel.show()}
	hide() {this.modalPanel.hide()}

	serialize() {}
	destroy() {
		this.modalPanel.destroy();
	}
}


export class BGCliCommand {
	constructor(cmd, options) {
		this.onDone    = options["onDone"]    || ()=>{};
		this.onSuccess = options["onSuccess"] || ()=>{};
		this.onFailure = options["onFailure"] || ()=>{};
		this.stdout = "";
		this.stderr = "";

		// TODO: make detecting the correct cdw and path to bg-debugCntr more robust. This assumes that there is only one
		//       atom project folder and that its a path to a bg-sp sandbox that includes bg-lib
		this.cwd = atom.project.getPaths()[0];
		setupCmd = "source bg-lib/bg-debugCntr vinstall .; ";

		this.msgWin = new FeedbackPane();

		if (cmd)
			this.runCommand(cmd);
	}

	runCommand(cmd) {
		console.log("cdw="+this.cwd);
		const bashProc = spawn(this.setupCmd+cmd, [], {
			shell: '/bin/bash',
			cwd: this.cwd
		} );

		bashProc.stderr.setEncoding('utf8');
		bashProc.stderr.on('data', (chunk) => {this.onStderrReceived(chunk)});

		bashProc.stdout.setEncoding('utf8');
		bashProc.stdout.on('data', (chunk) => {this.onStdoutReceived(chunk)});

		bashProc.on('close', (exitCode) => {this.onCmdDone(exitCode)});
	}

	onStderrReceived() {
		console.log(chunk);
		this.stderr += chunk + "\n";
		this.msgWin.setMessage(chunk);
	}

	onStdoutReceived() {
		console.log(chunk);
		this.stdout += chunk + "\n";
		this.msgWin.setMessage(chunk);
	}

	onCmdDone(exitCode) {
		console.log(`bashProc process exited with exitCode ${exitCode}`);
		this.msgWin.setMessage("Finished with exitCode="+exitCode);
		this.onDone((exitCode != 0));
		if (exitCode == 0)
			this.onSuccess();
		else
			this.onFailure();
		setTimeout(() => {
			this.msgWin.destroy();
		}, 2000)
	}
}
