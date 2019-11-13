'use babel';

import { el, list, mount, setAttr } from 'redom';
import glob from 'glob';
import util from 'util';

export class Button {
	constructor(label, callback) {
		this.el = el("button.atom-cyto-button", label);
		this.el.onclick = callback;
	}
}
