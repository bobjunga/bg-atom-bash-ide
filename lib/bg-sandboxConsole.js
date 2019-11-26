'use babel';

import { el, list, mount, setAttr } from 'redom';
import glob                         from 'glob';
import fs                           from 'fs';
import path                         from 'path';
import util                         from 'util';
import * as bgui                    from 'bg-redom-ui';
import { BGBashView }               from './bg-bashView';


// this is a BGBashView that knows about bg-scriptProjectDev
export class BGSandboxConsole extends BGBashView {

	constructor(uri, parent, options) {
		super(uri, parent, Object.assign({
			title: "BG Console",
			sbPath: ''
		}, options));

		this.sbPath = options['sbPath'];
		this.sbName = options['sbName'] || path.basename(this.sbPath);
		this.options['cwd'] = this.sbPath;
	}

	// finish construction after our rootElement has been added to the DOM. onDomReady is called by base class
	onDomReady() {
		super.onDomReady();

		// if the atom window has a bg-sandbox open, initialize the sandbox features
		if (this.sbPath) {
			this.term.registerLinkMatcher(
				/^[ \t]*([^ (]*)[(]([0-9]*)(:([0-9]*))?[)]:/,
				(ev,matchedStr) => this.onLinkClicked(ev,matchedStr)
			)

			// virtually install the sandbox in this bash session
			if (fs.existsSync(path.join(this.sbPath, 'bg-lib/bg-debugCntr'))) {
				this.exec('cd '+this.sbPath+'; source bg-lib/bg-debugCntr vinstall .');
				this.exec("bg-debugCntr sourceLibs\n")
			}
		}
	}

	// This link handler matches the bg-debugCntr style grep lines to open the file location in an editor pane
	//     <basefilename>(<line>): <text>
	// term.registerLinkMatcher(/^[ \t]*([^ (]*)[(]([0-9]*)(:([0-9]*))?[)]:/, (ev,matchedStr) => this.onLinkClicked(ev,matchedStr))
	async onLinkClicked(ev, matchedStr) {
		var rematch = matchedStr.match(/^[ \t]*([^ (]*)[(]([0-9]*)(:([0-9]*))?[)]:/)
		var [file,line, col] = [rematch[1], parseInt(rematch[2]), parseInt(rematch[4])];
		var fullFilename = await this.$('findInPaths '+file);
		//console.log(require('util').inspect({file,line,col,fullFilename}, { depth: null }));

		atom.workspace.open(
			path.normalize(fullFilename.toString()), {
			initialLine: line-1,
			initialColumn: col || 0,
			pending:true})
	}

	// if any of the atom project paths are a bg-sandbox project, return its path. If none are, return null
	static getSandboxPath() {
		var folders = atom.project.getPaths();
		for (var i=0; i<folders.length; i++) {
			try {
				var config = fs.readFileSync((path.join(folders[i], ".bg-sp/config")));
				if (config.indexOf('projectType=sandbox') != -1)
					return folders[i];
				// old branches of at-itapps do not contain the projectType attribute bu back then at-itapps was the only sandbox
				if ((config.indexOf('projectType=') == -1) && /at-itapps/i.test(folders[i]) )
					return folders[i];
			}
			catch(e) {};
		}
		return null;
	}

	// search the projects for the given regex including comments. The result is displayed in the terminal with links that will
	// open the location in an texteditor pane.
	codeGrep(regex) {
		regex = regex || atom.workspace.getActiveTextEditor().getSelectedText();
		if (regex)
			this.exec("bg-debugCntr codeGrep -C codeOnly "+regex);
	}
}
