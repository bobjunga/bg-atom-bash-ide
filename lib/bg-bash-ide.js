import fs from 'fs';
import path from 'path';
import util from 'util';
import { BGAtomPlugin, Disposables }  from 'bg-atom-utils'
import { AtomCytoView } from './bg-atom-cyto-view';
//import { BGBashView } from './bg-bashView'
import { BGSandboxConsole }  from './bg-sandboxConsole'


// Class for bg-bash-ide Atom plugin
// This provides various features when atom is opened on a bg-sp sandbox or pkgProject folder
//    * bg-console with sandbox vinstalled. Can execute commands programmatically from plugins and interactively.
//    * registers an openner for *.bgDeps graph network data files that will be opened with cytoscape.js
//
//   planned features
//    * bg-debugCntr bash remote debugger
//    * real time bash errors
//    * real time bgDeps updating
class BashIDEAtomPlugin extends BGAtomPlugin {
	constructor(state) {
		super('bg-bash-ide', state, __filename);
		this.sandboxCon = null;
		this.sandboxPath=null;
		this.sandboxName=null;

		// the bash console will be shown if and only if a sandbox folder is open. (in the bottom pane by default)
		//this.reopenSandboxConsole({quietFlag:true});

		// Register global commands
		this.addCommand('bg-bash-ide:openSandboxDependencies',   ()=>this.openSandboxDependencies());
		this.addCommand('bg-bash-ide:test',                      ()=>this.test());
		this.addCommand('bg-bash-ide:resetSandboxConsole',       ()=>this.reopenSandboxConsole());
		this.addCommand('bg-bash-ide:toggleSandboxConsole',      ()=>this.toggleSandboxConsole());
	}

	onURIOpening(uri) {
		if (path.extname(uri) == '.bgDeps')
			return new AtomCytoView(uri, this);
	}

	// this initializes the plugin to reflect whether the workspace has a bgsandbox project open.
	// Its called from the activate function but also can be called from a command so that the user can 'reset' the plugin
	// if it gets in a bad state.
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
			this.sandboxCon = new BGSandboxConsole(
				'bg://sandboxConsole/'+this.sandboxName, this, {
				title: this.sandboxName+' Sandox Console',
				sbPath: this.sandboxPath,
				sbName: this.sandboxName
			});
			//atom.workspace.addBottomPanel({item: this.sandboxCon});
			atom.workspace.open(this.sandboxCon);

			this.sandboxSubscriptions = new Disposables();
			this.sandboxSubscriptions.add(atom.commands.add('atom-workspace', {
				'bg-bash-ide:codeGrep': () => this.sandboxCon.codeGrep(),
			}));


			if (!quietFlag) atom.notifications.addInfo('bg sandbox found to be '+this.sandboxName, {dismissable:false});
		} else {
			this.sandboxName = null;
			if (!quietFlag) atom.notifications.addInfo('No bg sandbox found in this workspace', {dismissable:false})
		}
	}

	// if you see it, not you wont, if you dont, then you will
	toggleSandboxConsole() {
		if (this.sandboxCon)
			this.sandboxCon.toggle()
		else
			this.reopenSandboxConsole()
	}

	// open a cyto window for the full dependencies graph including all projects in the sandbox
	async openSandboxDependencies() {
		console.log('openSandboxDependencies!');
		var result = await this.sandboxCon.$('bg-dev analyze buildDeps');
		result.assertSuccess("Building dependancy data file failed");
		atom.workspace.open(".bglocal/dependencies.bgDeps")
	}

	test() {
		console.log("test: ");
	}
};

export default BGAtomPlugin.Export(BashIDEAtomPlugin);
