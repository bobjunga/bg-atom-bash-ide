'use babel';

import { el, list, mount, setAttr } from 'redom';
import glob                         from 'glob';
import util                         from 'util';
import { spawn }                    from 'child_process';
import * as bgui                    from 'bg-redom-ui';
import { BGAtomView }               from 'bg-atom-utils';
import { Terminal }                 from 'xterm';
import { BufferedProcess }          from 'atom';
import Path from 'path';


// this is a BGAtomView that runs an interactive bash process using xterm.js to display the output.
// commands can be sent to the bash process programmatically via the this.exec method or the user can enter commands interactively 
export class BGBashView extends BGAtomView {

	constructor(uri, parent, options) {
		super(uri, parent, Object.assign({
			title: "BG Bash"
		}, options));

		// Create a control bar across the top
		this.cntrPanel = new bgui.Panel(this);

		this.term = null;
		this.bash = null;
	}

	// finish construction after our rootElement has been added to the DOM. onDomReady is called by base class
	onDomReady() {
		// Create a terminal element
		this.termPanel = el("div.bg-terminal");
		mount(this.rootElement, this.termPanel);

		// Create the terminal
		this.term = new Terminal({convertEol: true});

		// attach the the term to the DOM and size it
		this.term.open(this.termPanel);
		this.onResize();

		// create the bash process
		// this.bash = new BufferedProcess({
		// 	command: 'bash',
		// 	args: ['-i'],
		// 	stdout: (data) => this.term.write(data),
		// 	stderr: (data) => this.term.write(data),
		// 	exit: (exitCode) => this.dispose()
		// })
		// this.term.onData((data) => {this.bash.process.stdin.write(data);})

		this.bash = spawn('bash', ['-i'], {
			stdio: ['pipe','pipe','pipe','pipe'],
			cdw: this.options['cdw']||""
		});

		this.bash.stdout.setEncoding('utf8');
		this.bash.stderr.setEncoding('utf8');
		this.bash.stdin.setEncoding('utf8');
		this.bash.stdio[3].setEncoding('utf8');
		
		// connect the term and bash pipes
		this.bash.stdout.on("data", (data) => {this.term.write(data)});
		this.bash.stderr.on("data", (data) => {this.term.write(data)});
		this.term.onData(           (data) => {this.bash.stdin.write(data);})
	}

	// override onResize to set the right number of cols and rows
	onResize() {
		// TODO: change this code to use the TerminalFit addon. 2019-11 it would not work. The parent size was always too tall but the same code out here worked fine
		var charSize = {
			w: this.term._core._renderService.dimensions.actualCellWidth,
			h: this.term._core._renderService.dimensions.actualCellHeight,
		}
		const termWinSize = {
			w: parseInt(window.getComputedStyle(this.termPanel.parentElement).getPropertyValue('width')),
			h: parseInt(window.getComputedStyle(this.termPanel.parentElement).getPropertyValue('height'))
		}
		const termDims = {
			cols: parseInt(termWinSize.w / charSize.w),
			rows: parseInt(termWinSize.h / charSize.h),
		}
		termDims.cols = (!termDims.cols || termDims.cols<80)?80 : termDims.cols;
		termDims.rows = (!termDims.rows || termDims.rows<2 )?2  : termDims.rows;
		this.term.resize(termDims.cols,termDims.rows);
	}

	// enter a cmd on the bash stdin programmatically
	exec(cmdString) {
		this.bash.stdin.write(cmdString+"\n");
	}

	// enter a cmd on the bash stdin programmatically and capture its stdout output into a return value instead of writing it to
	// the xterm. This is kind of like bash's command substitution $() syntax
	async $(cmdString) {
		this.bash.stdin.write(cmdString+" >&3 \n");
		return new Promise((resolve,reject) => {
			this.bash.stdio[3].once("data", (data) => {
				// remove trailing newlines like bash does for $()
				if (/\n$/.test(data))
					data = data.slice(0,data.length-1);
				// TODO: detect when the output spans multiple callback calls
				resolve(data.toString());
			})
		})
	}
}
