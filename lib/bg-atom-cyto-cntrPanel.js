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

export class LayoutSelector {
	constructor(callback) {
		this.el = el("select.atom-cyto-select");
		this.callback = callback;

		this.el.onchange = () => {
			callback(this.el.value);
		}

		glob('**/.bg-sp/*.layout', (err, files) => {
			for (file of files) {
				var option = el("option", file.toString());
				this.el.add(option);
			}
		});
	}
}


export class VisibilityToggle {
	constructor(view, label, selector) {
		this.view = view;
		this.selector = selector;
		this.el = el("button.atom-cyto-button", label);
		this.el.onclick = () => {
			this.view.toggleElements( this.view.cy.elements(this.selector));
		};
	}
}


// This is the button element used by MutexToolGroup
// Renders:
//     <span class="mx-button">
//         <input type="radio" name="mx" id="button4">
//         <label for="button4" unselectable>Button 4</label>
//     </span>
export class MutexToolButton {
	constructor() {
		this.el = el("span.mx-button");
		this.radio = el("input", {type: 'radio'});       mount(this.el, this.radio);
		this.label = el("label", {unselectable: true});  mount(this.el, this.label);
	}

	update(data, index, items, grpObj) {
		this.grpObj = grpObj;
		this.radio.name     = grpObj.name;
		this.radio.id       = data.id;
		this.radio.checked  = (grpObj.value == this.radio.id);
		this.label.textContent  = data.label;
		setAttr(this.label, {for: this.radio.id});

		this.radio.onchange = (e) => {this.grpObj.onButtonChange(e, this.radio.id);}
	}
}


// buttons is an [] of {id: "id", label: "label"} objects
// the value attribute of this object is the buttonID of the button that is currently selected
// if an image resource is available for (this.name,buttonID), it will be used to render the button
// and if not, the buttonLabel text will be used.
export class MutexToolGroup {
	constructor(grpName, onChangeCB, buttons, selected) {
		this.name = grpName;
		this.onChange = onChangeCB;
		this.el = list("span#"+grpName+".mx-buttonGroup", MutexToolButton);
		this.update(buttons, selected);
		//mount(this.el, el("label", {for: this.name}, "Click Tools"));
	}

	// the set of buttons can change
	update(buttons, selected) {
		this.value = selected;
		this.el.update(buttons, this);
	}

	// this maintains the this.value attribute and also fires the onChange callback of the caller if set
	onButtonChange(e, newValue) {
		if (this.value != newValue) {
			this.prevValue = this.value;
			this.value = newValue;
			if (typeof this.onChange == "function")
				this.onChange(this.value);
		}
	}
}



// A panel of controls to manipulate a bg-scriptProjectDev dependancy graph
export class Panel {
	constructor() {
		this.el = el("div.atom-cyto-cntrPanel")
		this.cntrls = [];
    }

	add(cntr) {
		this.cntrls.push(cntr);
		mount(this.el, cntr);
	}
}
