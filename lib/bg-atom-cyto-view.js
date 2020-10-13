
import JSON5 from 'json5';
import fs from 'fs';
import path from 'path';
import util from 'util';
import querystring from 'querystring';
import _ from 'lodash';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import coseBilkent from 'cytoscape-cose-bilkent';
import * as bgdom from 'bg-dom';
import { BGAtomView } from 'bg-atom-utils'
import { BGCompoundGridLayout, RecursiveCompoundLayout } from './bg-atom-cyto-layouts';
import { sprintf } from 'sprintf-js'


// This class is the editor workspace item that opens on a graph network data file. Its created by the workspace.opener callback registered
// in the <plugin>.activate method when the file being opened is recognized to be a graph network data file.
// It uses cytoscape.js to render the graph network.
export class AtomCytoView extends BGAtomView {
	constructor(uri,plugin) {
		super(uri, plugin, {defaultLocation: 'right',allowedLocations: ['left', 'right', 'bottom']}, '$div.bg-atom-cytoscape');
		this.filename = path.basename(this.uri);
		this.dirname = path.dirname(this.uri);
		this.saveFilename = this.uri;
		if (this.uri.lastIndexOf('.withPos.') == -1)
			this.saveFilename = this.uri.substr(0, this.uri.lastIndexOf('.')) + '.withPos.bgDeps';

		this.title = this.filename || 'cytoscape';

		// Create a control bar across the top
		this.mount([
			new bgdom.Panel({
				name: 'cntrPanel',
				content: [
					new bgdom.Button(          "btnEditTxt:Edit Text",            () => {this.onOpenInTextEditor()}),
					new bgdom.Button(          "btnRerun:Re-run Layout",          () => {this.runLayout()}),
				//	new bgdom.LayoutSelector(                             (filename) => {this.applyLayout(filename)}),
					new bgdom.Button(          "btnReset:Reset",                  () => {this.resetGraph()}),
					new bgdom.Button(          "btnEdgesOn:Edges On",             () => {this.showElements(this.cy.edges())}),
					new bgdom.Button(          "btnEdgesOff:Edges Off",           () => {this.hideElements(this.cy.edges())}),
					new bgdom.Button(          "btnAutoLayout:Auto Layout",       () => {this.layoutCompoundNodeRecursive(this.cy.nodes())}),
					new CytoVisibilityToggle(  "btnTogUnitTests:Unit Tests",      this, ".unitTest"),
					new CytoVisibilityToggle(  "btnTogCmds:Commands",             this, ".command"),
					new CytoVisibilityToggle(  "btnTogEdges:Actual Edges",        this, '[edgeType *= "CallsFnc"]'),
					new CytoVisibilityToggle(  "btnTogCompEdges:Composite Edges", this, '[edgeType *= "Composite"]'),
					//add to visibility? FncCallsFnc,GlbCallsFnc,FncUsesVar,FileUsesVar,CompositeFileToFile
					bgdom.Component.el('br'),
					bgdom.Component.el("label", {for: 'nodeClickToolBar'}, "Click Tools"),
					new bgdom.RadioButtonGroup(
						'nodeClickToolBar:',
						'layout',
						(selectedTool) => {this.onToolChanged(selectedTool)},
						[
							["togEdges:    In/Out Edges"],
							["togEdgesOut: Out Edges"],
							["togEdgesIn:  In Edges"],
							["layout:      Layout"],
							["fullLayout:  Full Layout"],
							["nodeDetails: Node Details"],
						]
					),

					bgdom.Component.el('br'),
					new bgdom.Component("nodeClickToolDetails:$div"),
				]
			}),
			new bgdom.Component('cytoDiv:$div#cy.atom-cyto-view')
		]);


		// this.aBGCompoundGridLayout = new BGCompoundGridLayout({
		//
		// });
		// init the cytoscape extensions
		cytoscape( 'layout', 'BGCompoundGridLayout', BGCompoundGridLayout ); // register with cytoscape.js
		cytoscape( 'layout', 'RecursiveCompoundLayout', RecursiveCompoundLayout ); // register with cytoscape.js

		//	cytoscape.use( BGCompoundGridLayout );
		cytoscape.use( fcose );
		cytoscape.use( cola );
		cytoscape.use( coseBilkent );
	}

	onToolChanged(selectedTool) {
		console.log("selected node click tool changed to '"+selectedTool+"'  '"+this.cntrPanel.nodeClickToolBar.value+"'");
		this.cntrPanel.nodeClickToolDetails.setChildren([]);
		switch(this.cntrPanel.nodeClickToolBar.value) {
			case "togEdges":
				this.cntrPanel.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges going in and out ";
				break;
			case "togEdgesOut":
				this.cntrPanel.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges coming out ";
				break;
			case "togEdgesIn":
				this.cntrPanel.nodeClickToolDetails.textContent = "Click on a node to toggle all of its edges going in ";
				break;
			case "layout":
				this.cntrPanel.nodeClickToolDetails.textContent = "Click on a file or project to layout its contents ";
				break;
			case "nodeDetails":
				this.cntrPanel.nodeClickToolDetails.textContent = "Click on a node to see its details";
				break;
			default:
		}
		this.cy.resize();
	}

	onNodeClick(e) {
		switch(this.cntrPanel.nodeClickToolBar.value) {
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
					this.layoutCompoundNode(e.target);
				}
				break;
			case "fullLayout":
				if (e.target.data('nodeType') != "func") {
					this.layoutCompoundNodeRecursive(e.target);
				}
				break;
			case "nodeDetails":
				this.cntrPanel.nodeClickToolDetails.textContent = "";
				var absPos = e.target.position();
				var relPos = e.target.relativePosition();
				var dim = e.target.layoutDimensions({nodeDimensionsIncludeLabels: true});
				this.cntrPanel.nodeClickToolDetails.setChildren([
					bgdom.Component.el("div", "Name: "+e.target.id()),
					bgdom.Component.el("div", "Type: "+e.target.data('nodeType')),
					bgdom.Component.el("div", "Classes: "+e.target.classes()),
					bgdom.Component.el("div", sprintf("position: (%d,%.0f) rel(%.0f,%.0f) size(%.0f,%.0f)", absPos.x,absPos.y, relPos.x,relPos.y, dim.w,dim.h)),
				])
				this.cy.resize();
				//this.cy.mount(this.cy.container());
				// mount(this.cntrPanel.nodeClickToolDetails,
				// 	bgdom.Component.el("div", "abs pos: ("+absPos.x+","+absPos.y+")")
				// );
				// 	bgdom.Component.el("div", "rel pos: ("+relPos.x+","+relPos.y+")"),
				// 	bgdom.Component.el("div", "dim: ("+dim.w+","+dim.h+")"),
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
					console.log("layoutCompoundNodeRecursive is ended");
					delete this.runningRecursiveCompoundLayout;
				}
			});
			this.runningRecursiveCompoundLayout.run();
		} else {
			console.log("last layoutCompoundNodeRecursive not complete");
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



	showError(err) {
		if (!err) {
			this.errorBar.innerText = "";
		} else {
			this.errorBar.innerText = err.toString();
		}
	}

	getPath ()   {return this.dirname;}

	onOpenInTextEditor() {
		atom.workspace.open(this.uri+"?editor=text");
	}


	// cytoscape can not be initialized before the DIV that it uses is realized in the DOM and therefore has a non-zero size.
	// atom does not seem to fire any event after it adds the view object returned by the opener callback to the DOM so this
	// onLoad event is currently being generated by a trick with a temporary iframe using postMessage to let us know when its loaded.
	onDomReady() {
		try {
			this.cy = cytoscape({
				container : this.cytoDiv.el,
			});

		} catch(e) {
			console.error(e);
			this.showError(e);
		}

		fs.readFile(this.uri, (err, fileContents) => {
			if (err) {
				console.error(err);
				return;
			}
			try {
				const data=JSON5.parse(fileContents.toString());
				this.cy.json(data);
				console.log("added data to cyto");

				this.hideElements(this.cy.edges());

				this.cy.style().fromJson([
					{
						"selector": "node",
						"style": {
							'min-zoomed-font-size': '10pt',
						}
					},
					{
						"selector": "node[nodeType = 'project']",
						"style": {
							'background-color': '#FFE6CC',
							'label': 'data(id)',
							'font-size': '30pt'
						}
					},
					{
						"selector": "node[nodeType = 'file']",
						"style": {
							'background-color': '#DAE8FC',
							'label': 'data(id)',
							'font-size': '8pt'
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


// this is a ToggleButton that knows how to toggle the visibility of a cyto selector expression in a CytoView
class CytoVisibilityToggle extends bgdom.ToggleButton {
	constructor(bgNodeID, cytoView, selector, ...p) {
		super(bgNodeID, ...p);
		this.cytoView = cytoView;
		this.selector = selector;
	}

	onStateChange(newState) {
		if (newState)
			this.cytoView.showElements( this.cytoView.cy.elements(this.selector));
		else
			this.cytoView.hideElements( this.cytoView.cy.elements(this.selector));
		super.onStateChange(newState);
	}
}
