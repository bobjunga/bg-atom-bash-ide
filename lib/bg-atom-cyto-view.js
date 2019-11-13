'use babel';

import JSON5 from 'json5';
import fs from 'fs';
import path from 'path';
import util from 'util';
import querystring from 'querystring';
import _ from 'lodash';
//import cytoscape from '../node_modules/cytoscape/dist/cytoscape.umd.js';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import coseBilkent from 'cytoscape-cose-bilkent';
import { el, mount, setChildren } from 'redom';
import * as CytoCntr from './bg-atom-cyto-cntrPanel';
import { BGCompoundGridLayout, RecursiveCompoundLayout } from './bg-atom-cyto-layouts';
import { sprintf } from 'sprintf-js'


// This class is the editor pane that opens on a graph network data file. Its created by the workspace.opener callback registered
// in the <plugin>.activate method when the file being openned is recognized to be a graph network data file.
// It uses cytoscape.js to render the graph network.
export default class AtomCytoView {

  // construct a new AtomCytoView
  // cytoscape.js has a quirk where it can not be initialized before its DIV element has been added to the DOM and therfore has a 
  // non zero size so this view uses an iframe trick to generate a 'onLoad' type message. I could not find a native atom event that
  // fires after the view is realized in the DOM
	constructor(props) {
		this.props = props || {};
		this.filename = '';
		this.dirname = '';
		if (this.props.URI) {
			this.filename = path.basename(this.props.URI);
			this.dirname = path.dirname(this.props.URI);
			this.saveFilename = this.props.URI;
			if (this.props.URI.lastIndexOf('.withPos.') == -1)
				this.saveFilename = this.props.URI.substr(0, this.props.URI.lastIndexOf('.')) + '.withPos.cyjs';
		}
		this.title = this.filename || 'draw.io';

		// Create root element for this View
		this.rootElement = document.createElement('div');
		this.rootElement.classList.add('atom-cyto');

		// Create a control bar across the top
		this.cntrPanel = new CytoCntr.Panel();
		this.cntrPanel.add(new CytoCntr.Button(                "Edit Text",       () => {this.onOpenInTextEditor()}));
		this.cntrPanel.add(new CytoCntr.Button(                "Re-run Layout",   () => {this.runLayout()}));
		this.cntrPanel.add(new CytoCntr.LayoutSelector(                   (filename) => {this.applyLayout(filename)}));
		this.cntrPanel.add(new CytoCntr.Button(                "Reset",           () => {this.resetGraph()}));
		this.cntrPanel.add(new CytoCntr.Button(                "Edges On",        () => {this.showElements(this.cy.edges())}));
		this.cntrPanel.add(new CytoCntr.Button(                "Edges Off",       () => {this.hideElements(this.cy.edges())}));
		this.cntrPanel.add(new CytoCntr.VisibilityToggle(this, "Unit Tests",      ".unitTest"));
		this.cntrPanel.add(new CytoCntr.VisibilityToggle(this, "Commands",        ".command"));
		this.cntrPanel.add(new CytoCntr.VisibilityToggle(this, "Actual Edges",    '[edgeType *= "CallsFnc"]'));
		this.cntrPanel.add(new CytoCntr.VisibilityToggle(this, "Composite Edges", '[edgeType *= "Composite"]'));
		//FncCallsFnc,GlbCallsFnc,FncUsesVar,FileUsesVar,CompositeFileToFile

		this.nodeClickToolBar = new CytoCntr.MutexToolGroup(
			"nodeClickToolBar",
			(selectedTool) => {this.onToolChanged(selectedTool)},
			[	{id: "togEdges",    label: "In/Out Edges"},
				{id: "togEdgesOut", label: "Out Edges"},
				{id: "togEdgesIn",  label: "In Edges"},
				{id: "layout",      label: "Layout"},
				{id: "fullLayout",  label: "Full Layout"},
				{id: "nodeDetails", label: "Node Details"},
			], 
			"togEdges"
		);
		this.cntrPanel.add(el("br"));
		this.cntrPanel.add(el("label", {for: this.nodeClickToolBar.name}, "Click Tools"));
		this.cntrPanel.add(this.nodeClickToolBar);

		this.nodeClickToolDetails = el("div#nodeClickToolDetails");
		this.cntrPanel.add(this.nodeClickToolDetails);

		mount(this.rootElement, this.cntrPanel);


		// Create a temporary iframe to generate the onLoad message back to us
		// TODO: maybe this is as simple as document.DOMContentLoaded ?
		this.cytoDiv = document.createElement('iframe');
		this.rootElement.appendChild(this.cytoDiv);
		window.addEventListener('message', (ev) => {this.onLoad(ev)});
		this.cytoDiv.src = `${__dirname}/postOnLoadMsgPage.html`;

// this.aBGCompoundGridLayout = new BGCompoundGridLayout({
// 
// });
		// init the cytoscape extensions
		cytoscape( 'layout', 'BGCompoundGridLayout', BGCompoundGridLayout ); // register with cytoscape.js
		cytoscape( 'layout', 'RecursiveCompoundLayout', RecursiveCompoundLayout ); // register with cytoscape.js

//		cytoscape.use( BGCompoundGridLayout );
		cytoscape.use( fcose );
		cytoscape.use( cola );
		cytoscape.use( coseBilkent );
	}

	onToolChanged(selectedTool) {
		console.log("selected node click tool changed to '"+selectedTool+"'  '"+this.nodeClickToolBar.value+"'");
		setChildren(this.nodeClickToolDetails, []);
		switch(this.nodeClickToolBar.value) {
			case "togEdges":
				this.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges going in and out ";
				break;
			case "togEdgesOut":
				this.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges coming out ";
				break;
			case "togEdgesIn":
				this.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges going in ";
				break;
			case "layout":
				this.nodeClickToolDetails.textContent = "Click on a file or project to layout its contents ";
				break;
			case "nodeDetails":
				this.nodeClickToolDetails.textContent = "Click on a node to see its details";
				break;
			default:
		}
		this.cy.resize();
	}

	onNodeClick(e) {
		switch(this.nodeClickToolBar.value) {
			case "togEdges":
				this.showNeighbors(e.target);
				break;
			case "togEdgesOut":
				this.showNeighbors(e.target, "out");
				break;
			case "togEdgesIn":
				this.showNeighbors(e.target, "in");
				break;
			case "layout":
				if (e.target.data('nodeType') != "func") {
					console.log("doing layout on '"+e.target.id()+"'("+e.target.data('nodeType')+")")
					this.layoutCompoundNode(e.target);
				}
				break;
			case "fullLayout":
				if (e.target.data('nodeType') != "func") {
					console.log("doing recursive layout on '"+e.target.id()+"'("+e.target.data('nodeType')+")")
					this.layoutCompoundNodeRecursive(e.target);
				}
				break;
			case "nodeDetails":
				this.nodeClickToolDetails.textContent = "";
				var absPos = e.target.position();
				var relPos = e.target.relativePosition();
				var dim = e.target.layoutDimensions();
				setChildren(this.nodeClickToolDetails, [
					el("div", "Name: "+e.target.id()),
					el("div", "Type: "+e.target.data('nodeType')),
					el("div", "Classes: "+e.target.classes()),
					el("div", sprintf("position: (%d,%.0f) rel(%.0f,%.0f) size(%.0f,%.0f)", absPos.x,absPos.y, relPos.x,relPos.y, dim.w,dim.h)),
				])
				this.cy.resize();
				//this.cy.mount(this.cy.container());
				// mount(this.nodeClickToolDetails,
				// 	el("div", "abs pos: ("+absPos.x+","+absPos.y+")")
				// );
				// 	el("div", "rel pos: ("+relPos.x+","+relPos.y+")"),
				// 	el("div", "dim: ("+dim.w+","+dim.h+")"),
				// ])
				break;
			default:
		}
	}

	runLayout(layoutInfo) {
		if (this.cyLayout)
			this.cyLayout.run();
	}

	applyLayout(layoutConfigFile) {
		fs.readFile(layoutConfigFile, (err, fileContents) => {
			try {
				if (err)
					throw err;
				console.log("applying layout from '"+layoutConfigFile+"'");
				layoutInfo=JSON5.parse(fileContents.toString());
				this.cyLayout = this.cy.layout(layoutInfo);
				this.cyLayout.run();
				console.log("applied layout");
			} catch(e) {
				console.error(e);
				this.showError(e);
			}
		});
	}


	layoutCompoundNode(compoundNode) {
		var subGraph = compoundNode;
		compoundNode.or(compoundNode.parents().or(subGraph)).removeClass('hidden');
		switch (compoundNode.data('nodeType')) {
			case 'project':
			case 'fileGroup':
			case 'file':
				var lay = subGraph.layout( {
					name: 'BGCompoundGridLayout',

					fit: false, padding: 30,
					boundingBox: undefined,
					avoidOverlap: true, avoidOverlapPadding: 10,
					nodeDimensionsIncludeLabels: false,
					spacingFactor: undefined, // 0.0 to 1.0 compresses
					condense: true,
					rows: undefined, cols: undefined,
					position: function( node ){}, // returns { row, col } for element
					sort: undefined, // e.g. function(a, b){ return a.data('weight') - b.data('weight') }
					animate: true, animationDuration: 500, animationEasing: undefined, animateFilter: function ( node, i ){ return true; },
					ready: () => {console.log("layout onReady")}, // callback on layoutready
					stop: () => {console.log("layout onStop")}, // callback on layoutstop
				}).run();
				console.log("layout done?")
				break;
			case 'func':
				break;
		}
	}

	layoutCompoundNodeRecursive(compoundNode) {
		if (!('runningRecursiveCompoundLayout' in this)) {
			this.runningRecursiveCompoundLayout = compoundNode.layout({
				name: 'RecursiveCompoundLayout',
				stop: () => {
					delete this.runningRecursiveCompoundLayout;
				}
			});
			this.runningRecursiveCompoundLayout.run();
		}
	}

	resetGraph() {
		console.log("resetGraph: showing all");
		this.cy.elements().removeClass('hidden');
	}

	hideElements(eles) {
		if (!eles)
			eles = this.cy.$(':selected');
		if (eles) {
			console.log("hideElements: hiding "+eles.size()+" elements");
			eles.addClass('hidden');
		}
	}

	showElements(eles) {
		if (!eles)
			eles = this.cy.$(':selected');
		if (eles) {
			console.log("showElements: showing "+eles.size()+" elements");
			eles.removeClass('hidden');
		}
	}

	toggleElements(eles) {
		if (!eles) {
			eles = this.cy.$(':selected');
			console.log("toggleElements: operating on "+eles.size()+" selected elements");
		}

		if (!eles) {
			console.log("toggleElements: showing all");
			this.cy.elements().removeClass('hidden');
		} else {
			if (eles.filter(".hidden").size() > 0) {
				console.log("toggleElements: showing "+eles.size()+" elements");
				eles.removeClass('hidden');
			} else {
				console.log("toggleElements: hiding "+eles.size()+" elements");
				eles.addClass('hidden');
			}
		}
	}

	showNeighbors(node, edgeType) {
		var nodeID = node.id();
		console.log("toggling neighbors of " + nodeID);
		var nodeGrp = node.or(node.descendants());
		switch (edgeType) {
			case "in":
				this.toggleElements(nodeGrp.incomers('edge'));
				break;
			case "out":
				this.toggleElements(nodeGrp.outgoers('edge'));
				break;
			default:
				this.toggleElements( nodeGrp.neighborhood('edge'));
				break;
		}
	}


	save() {
		console.log('AtomCytoView save '+this.saveFilename);
		fs.writeFile(this.saveFilename, JSON.stringify(this.cy.json(),null,4), (err) => {
		  if (err) showError(err);
		  console.log('The file has been saved!');
		});
	}

	saveAs() {
		console.log('AtomCytoView saveAs');
	}

	// Returns an object that can be retrieved when package is activated
	serialize() {}

	// Tear down any state and detach
	destroy() {
		console.log('AtomCytoView destroy()');
	}

	showError(err) {
		if (!err) {
			this.errorBar.innerText = "";
		} else {
			this.errorBar.innerText = err.toString();			
		}
	}

	// getters
	getElement() {return this.rootElement;}
	getTitle()   {return this.title;}
	getUri()     {return this.props.URI;}
	getPath ()   {return this.dirname;}

	onOpenInTextEditor() {
		atom.workspace.open(this.props.URI+"?editor=text");
		console.log("open in text editor");
	}


	// load the file and init cyto
	// cytoscape can not be initialized before the DIV that it uses is realized in the DOM and therefore has a non-zero size.
	// atom does not seem to fire any event after it adds the view object returned by the opener callback to the DOM so this
	// onLoad event is currently being generated by a trick with a temporary iframe using postMessage to let us know when its loaded.
	onLoad(ev) {
		// we only expect to get one msg so the contents is not important
		if (this.cytoDiv.contentWindow != ev.source) {
			return;
		}

		// replace the temporary iframe with the real cytoscape content div
		this.cytoDiv.remove();
		this.cytoDiv = document.createElement('div');
		this.cytoDiv.id = "cy";
		this.cytoDiv.classList.add('atom-cyto-view');
		this.rootElement.appendChild(this.cytoDiv);
 
		try {
			this.cy = cytoscape({
				container : this.cytoDiv,
			});

		} catch(e) {
			console.error(e);
			this.showError(e);
		}

		fs.readFile(this.props.URI, (err, fileContents) => {
			if (err) {
				console.error(err);
				return;
			}
			try {
				data=JSON5.parse(fileContents.toString());
				this.cy.json(data);
				console.log("added data to cyto");

				this.hideElements(this.cy.edges());

				this.cy.style().fromJson([
					{
						"selector": "node[nodeType = 'project']",
						"style": {
							'background-color': '#FFE6CC',
							'label': 'data(id)',
							'font-size': '14pt'
						}
					},
					{
						"selector": "node[nodeType = 'file']",
						"style": {
							'background-color': '#DAE8FC',
							'label': 'data(id)',
							'font-size': '10pt'
						}
					},
					{
						"selector": "node[nodeType = 'func']",
						"style": {
							'width': '0.5em',
							'height': '0.5em'
						}
					},
					{
						"selector": "edge",
						"style": {
							'target-arrow-shape': 'triangle',
							'mid-target-arrow-shape': 'triangle'
						}
					},
					{
						"selector": ".hidden",
						"style": {
							'visibility': 'hidden'
						}
					}
				]).update();

				this.cy.nodes().on('vclick', (e) => {if (e.seen) return; e.seen=true; this.onNodeClick(e)});

				//console.log("loaded fileContents = "+ util.inspect(data, {compact:false}));
			} catch(e) {
				console.error(e);
				this.showError(e);
			}
		});
	}
}
