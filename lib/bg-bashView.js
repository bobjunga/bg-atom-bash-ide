'use babel';

import { el, list, mount, setAttr } from 'redom';
import glob                         from 'glob';
import util                         from 'util';
import { spawn, execSync }          from 'child_process';
import * as bgui                    from 'bg-redom-ui';
import { BGAtomView }               from 'bg-atom-utils';
import { Terminal }                 from 'xterm';
import { BufferedProcess }          from 'atom';
import Path                         from 'path';
import fs                           from 'fs';
//import pty                          from 'node-pty';
var pty = require('node-pty');


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

		// create the bash process
		// this.bash = new BufferedProcess({
		// 	command: 'bash',
		// 	args: ['-i'],
		// 	stdout: (data) => this.term.write(data),
		// 	stderr: (data) => this.term.write(data),
		// 	exit: (exitCode) => this.dispose()
		// })
		// this.term.onData((data) => {this.bash.process.stdin.write(data);})

		if (pty) {
			console.log("using pty");
			this.bash = pty.spawn('bash', ['-i'], {
				name: 'xterm-color',
				cols: 80,
				rows: 30,
				cdw: this.options['cdw']||""
			});
			this.bash.on("data", (data) => {if (!this.termOutputOff) this.term.write(data)});
			this.term.onData((data) => {this.bash.write(data);})
			this.bashWrite = (data) => this.bash.write(data);

		// non-pty version
		} else {
			console.log("term w/o pty");
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
			this.bashWrite = this.bash.stdin.write
		}

		//console.log(require('util').inspect(this.bash, { depth: null }));
		this.onResize();
	}

	// override onResize to set the right number of cols and rows
	onResize() {
		console.log('onResize');
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
		this.bash.resize(termDims.cols,termDims.rows);
	}

	// enter a cmd on the bash stdin programmatically
	exec(cmdString) {
		this.bashWrite(cmdString+"\n");
	}

	// enter a cmd on the bash stdin programmatically and capture its stdout output into a return value instead of writing it to
	// the xterm. This is kind of like bash's command substitution $() syntax
	// IPC Strategy:
	// This command uses the user's interactive bash console that has already been set up to vinstall the sandbox. It redirects
	// the bash command's output to a FIFO pipe that this function owns. The command (or script) that we send bash redirects to the
	// FIFO pipe once for each discrete message that it wants to send back to us. We collect the input from the FIFO over 0 or more
	// onData callbacks and then when the FIFO close event is fired we know that that message is done. In bash, each redirect will
	// open, write, then close the FIFO. If we used 'exec {fd}>stdoutPipeName', it would open it for writing and leave it open until
	// 'exec {fd}>&-' is called so we should prefere '{ <cmds>; } >stdoutPipeName' so that it open/writes/closes in a single transaction.
	async $(cmdString) {
		const start = process.hrtime.bigint();

		var stdoutPipeName = '/tmp/atom-'+process.pid+'.stdout';
		var stderrPipeName = '/tmp/atom-'+process.pid+'.stderr';
		var exitCodePipeName = '/tmp/atom-'+process.pid+'.exitCode';

		// disable output from bash to our term for the duration so that the cmd does not get echoed.
		this.termOutputOff = true;

		execSync('rm -f '+stdoutPipeName+' '+stderrPipeName+' '+exitCodePipeName+'; mkfifo '+stdoutPipeName+' '+stderrPipeName+' '+exitCodePipeName);
		this.bashWrite('{ '+cmdString+'; } >'+stdoutPipeName+' 2>'+stderrPipeName+'; echo $? >'+exitCodePipeName+'\n')

		var stdoutPipe = fs.createReadStream(stdoutPipeName, {encoding: 'utf8', emitClose: true});
		var stderrPipe = fs.createReadStream(stderrPipeName, {encoding: 'utf8', emitClose: true});
		var exitCodePipe = fs.createReadStream(exitCodePipeName, {encoding: 'utf8', emitClose: true});
		var stdoutBuf=''; var stderrBuf=''; var exitCodeBuf;
		stdoutPipe.on('data', (data) => {stdoutBuf+=data});
		stderrPipe.on('data', (data) => {stderrBuf+=data});
		exitCodePipe.on('data', (data) => {exitCodeBuf=parseInt(data)});

		await Promise.all([
			new Promise(resolve => {stdoutPipe.on('close', () => resolve())}),
			new Promise(resolve => {stderrPipe.on('close', () => resolve())}),
			new Promise(resolve => {exitCodePipe.on('close', () => resolve())})
		]);
		//fs.unlink(stdoutPipeName, (err) => {if (err) throw err});
		this.termOutputOff = false;

		// remove trailing newlines like bash does for $()
		if (/\n$/.test(stdoutBuf))
			stdoutBuf = stdoutBuf.slice(0,stdoutBuf.length-1);

		const end = process.hrtime.bigint();
		console.log(`$() took ${end - start} nanoseconds returning =${stdoutBuf}`);
		return new class {
			constructor() {
				this.stdout  = stdoutBuf;
				this.stderr  = stderrBuf;
				this.exitCode= exitCodeBuf;
			}
			toString() {return this.stdout}
		}
	}
}
