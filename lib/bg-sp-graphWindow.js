'use babel';

import fs from 'fs';
import path from 'path';
import AtomCytoView from './bg-atom-cyto-view';
import { CompositeDisposable } from 'atom';

// Class for bg-sp-graphWindow Atom plugin
// This registers an openner for graph network data files that will be openned with cytoscape.js
export default {
	// subscriptions is a place to put things that need to be cleaned up on deativation
	subscriptions: null, // type CompositeDisposable

	activate(state) {
		this.subscriptions = new CompositeDisposable();

		// Register command that toggles this view (does not currently do anything)
		this.subscriptions.add(atom.commands.add('atom-workspace', {
			'bg-sp-graphWindow:toggle': () => this.toggle()
		}));

		// Register an opener for files that match isAFileWeShouldOpen(uri)
		atom.workspace.addOpener((uri) => {
			if (this.isAFileWeShouldOpen(uri)) {
				return new AtomCytoView({
					URI: uri,
					parent: this
				});
			} else if (uri.match(/[?]editor=text$/)) {
				return atom.workspace.openTextFile(uri.replace(/[?]editor=text$/, ""));
			}
		});
	},

	deactivate() {
		this.subscriptions.dispose();
	},

	serialize() {
		return ;
	},

	// TODO: add a config setting for matching extensions
	isAFileWeShouldOpen(uri) {
		const ext = path.extname(uri);
		return (ext === '.cyjs');
	},



	// maybe we will make this toggle one well-known graph network data file that is the graph of the project's dependancies
	// but maybe that should be a separate plugin -- this one very generic, the other one knows about bg-scriptProjectDev 
	toggle() {
		console.log('BgAtomTest was toggled!');
		atom.workspace.toggle(".bg-sp/dependencies.cyjs")
		return ;
	}

};
