'use babel';

import fs from 'fs';
import path from 'path';
import util from 'util';
import AtomCytoView from './bg-atom-cyto-view';
import { CompositeDisposable } from 'atom';
import { BGCliCommand } from './bg-sp-updateDepGraph'
//import { BGBashView } from './bg-bashView'
import { BGSandboxConsole }  from './bg-sandboxConsole'


// Class for bg-scriptProjectDev Atom plugin
// This provides various features when atom is opened on a bg-sp sandbox or pkgProject folder
//    * registers an openner for *.bgDeps graph network data files that will be openned with cytoscape.js
//   planned features
//    * bg-debugCntr bash remote debugger
//    * real time bash errors
//    * real time bgDeps updating
export default {
	// subscriptions is a place to put things that need to be cleaned up on deativation
	subscriptions: null, // type CompositeDisposable

	activate(state) {
		this.subscriptions = new CompositeDisposable();
		this.sandboxCon = null;
		this.sandboxPath=null;
		this.sandboxName=null;

		this.reopenSandboxConsole({quietFlag:true});

		// Register global commands
		this.subscriptions.add(atom.commands.add('atom-workspace', {
			'bg-scriptProjectDev:openSandboxDependencies': () => this.openSandboxDependencies(),
			'bg-scriptProjectDev:test': () => this.test(),
			'bg-scriptProjectDev:reopenSandboxConsole': () => this.reopenSandboxConsole(),
		}));

		// Register an opener for .bgDeps and .bgDeps?editor=text files
		this.subscriptions.add(atom.workspace.addOpener((uri) => {
			if (path.extname(uri) == '.bgDeps') {
				return new AtomCytoView({URI: uri, parent: this});
			} else if (uri.match(/[?]editor=text$/)) {
				return atom.workspace.openTextFile(uri.replace(/[?]editor=text$/, ""));
			}
		}));

	},

	// this initializes the plugin to reflect whether the workspace has a bgsandbox project open.
	reopenSandboxConsole(options) {
		const {quietFlag} = options || {};
		if (this.sandboxCon) {
			this.sandboxCon.destroy();
			delete this.sandboxCon;
		}

		if (this.sandboxSubscriptions) {
			this.sandboxSubscriptions.dispose();
			delete this.sandboxSubscriptions;
		}

		this.sandboxPath = BGSandboxConsole.getSandboxPath();
		if (this.sandboxPath) {
			this.sandboxName = path.basename(this.sandboxPath);
			this.sandboxCon = new BGSandboxConsole('bg://sandboxConsole/'+this.sandboxName, this, {
				title: this.sandboxName+' Sandox Console'
			});
			atom.workspace.open(this.sandboxCon);

			this.sandboxSubscriptions = new CompositeDisposable();
			this.sandboxSubscriptions.add(atom.commands.add('atom-workspace', {
				'bg-scriptProjectDev:codeGrep': () => this.sandboxCon.codeGrep(),
			}));


			if (!quietFlag) atom.notifications.addInfo('bg sandbox found to be '+this.sandboxName, {dismissable:false});
		} else {
			this.sandboxName = null;
			if (!quietFlag) atom.notifications.addInfo('No bg sandbox found in this workspace', {dismissable:false})
		}
	},

	deactivate() {
		this.subscriptions.dispose();
	},

	serialize() {
		return ;
	},

	// open a cyto window for the full dependencies graph including all projects in the sandbox
	openSandboxDependencies() {
		console.log('openSandboxDependencies!');
		fs.existsSync()
		var updater = new BGCliCommand("bg-bashParse build > .bg-sp/dependencies.bgDeps", {onSuccess: () => {
			atom.workspace.toggle(".bg-sp/dependencies.bgDeps")
		}});
	},

	test() {
		console.log("test: ");
	}
};
