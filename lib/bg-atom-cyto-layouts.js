'use babel';

import util from 'util';

// These are the default values for the options input
const defaults = Object.freeze({
	// animation
	animate: true,                // whether or not to animate the layout
	animationDuration: 500,       // duration of animation in ms, if enabled
	animationEasing: undefined,   // easing of animation, if enabled
	animateFilter: ( node, i ) => true, // whether to animate specific nodes when animation is on; non-animated nodes immediately go to their final positions

	// viewport position to leave the display at when done
	pan: undefined,  // pan the graph to the provided position, given as { x, y }
	zoom: undefined, // zoom level as a positive number to set after animation
	fit: undefined,  // fit the viewport to the repositioned nodes, overrides pan and zoom

	// layout algorithm

	// target rows and cols determines the relative shape of the grid only and are not exact.
	// When both are undefined (or specified with the same value) the algorithm will attempt to make the grid square
	// When one or the other is specified, the algorithm will attempt to place that many on average in that dimension.
	// When both are specified, the algorithm will attempt to make the grid have that ratio of cols/rows
	rows: undefined,             // target number of rows in the grid
	cols: undefined,             // target number of columns in the grid
	padding: 30,                 // padding around layout
	boundingBox: undefined,      // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
	spacingFactor: undefined,    // a positive value which adjusts spacing between nodes (>1 means greater than usual spacing)
	nodeDimensionsIncludeLabels: true, // whether labels should be included in determining the space used by a node (default true)
	transform: ( node, pos ) => pos, // a function that applies a transform to the final node position

	// layout event callbacks
	ready: () => {}, // on layoutready
	stop: () => {} // on layoutstop
});

// This class provides a mechanism to batch up the results of multiple layouts (that are written to cooperate with it) that are
// dependant on each others output
class VirtualGraphPositions {
	constructor() {
		this.nodeData = {};
		this.nestCount = 0;
		this.layouyPositionsArgs = {
			eles: null,
			lay: null,
			options: null
		}
	}

	sessionStart() {
		if (this.nestCount == 0)
			this.nodeData = {};
		this.nestCount++;
	}
	sessionEnd() {
		this.nestCount--;
		if (this.nestCount == 0)
			this.layoutPositions(this.layouyPositionsArgs.eles, this.layouyPositionsArgs.lay, this.layouyPositionsArgs.options);
	}

	cacheNodeData(node) {
		var dim = node.layoutDimensions();
		var pos = node.position();
		var posRel = node.relativePosition();
		this.nodeData[node.id()] = {
			w: dim.w,
			h: dim.h,
			x: pos.x,
			y: pos.y,
			xRel: posRel.x,
			yRel: posRel.y,
			orig: {
				x: pos.x,
				y: pos.y,
				xRel: posRel.x,
				yRel: posRel.y,
			}
		}
	}
	position(node) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		return {
			x: ndata.x,
			y: ndata.y,
		}
	}
	relativePosition(node) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		return {
			x: ndata.xRel,
			y: ndata.yRel,
		}
	}
	layoutDimensions(node) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		return {
			w: ndata.w,
			h: ndata.h,
		}
	}

	setBounds(node, bounds) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		bounds.x1 = Math.min(bounds.x1, ndata.x - ndata.w/2);
		bounds.y1 = Math.min(bounds.y1, ndata.y - ndata.h/2);
		bounds.x2 = Math.max(bounds.x2, ndata.x + ndata.w/2);
		bounds.y2 = Math.max(bounds.y2, ndata.y + ndata.h/2);
		bounds.w = bounds.x2 - bounds.x1;
		bounds.h = bounds.y2 - bounds.y1;
	}

	increaseSizeBy(node, widthToAdd, heightToAdd) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		ndata.w += widthToAdd;
		ndata.h += heightToAdd;
	}

	setFromBounds(node, bounds) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		ndata.w = bounds.w;
		ndata.h = bounds.h;
		this.moveNode(node, {
			x: (bounds.x2 + bounds.x1)/2 - ndata.x,
			y: (bounds.y2 + bounds.y1)/2 - ndata.y,
		})
		ndata.y = (bounds.y2 - bounds.y1)/2;
	}

	moveNode(node, delta) {
		if (!(node.id() in this.nodeData))
			this.cacheNodeData(node);
		var ndata = this.nodeData[node.id()];
		ndata.x += delta.x;
		ndata.y += delta.y;
		ndata.xRel += delta.x;
		ndata.yRel += delta.y;
	}

	layoutPositions(eles, lay, options) {
		if (this.nestCount == 0)
			eles.layoutPositions( lay, options, (node) => {return this.position(node)} );
		else {
			this.layouyPositionsArgs.eles = eles.or(this.layouyPositionsArgs.eles);
			this.layouyPositionsArgs.lay = lay;
			this.layouyPositionsArgs.options = options;
		}
	}
}

var vGraphPositions = new VirtualGraphPositions();


class BoundingBox {
	constructor() {
		this.x1 =  Infinity;
		this.y1 =  Infinity;
		this.x2 = -Infinity;
		this.y2 = -Infinity;
		this.w  =  0;
		this.h  =  0;
	}

	expandToInclude(p) {
		if ('x' in p) {
			this.x1=Math.min(this.x1, p.x);
			this.x2=Math.max(this.x2, p.x);
			this.y1=Math.min(this.y1, p.y);
			this.y2=Math.max(this.y2, p.y);
		}
		if ('x1' in p) {
			this.x1=Math.min(this.x1, p.x1);
			this.x2=Math.max(this.x2, p.x1);
			this.y1=Math.min(this.y1, p.y1);
			this.y2=Math.max(this.y2, p.y1);
		}
		if ('x2' in p) {
			this.x1=Math.min(this.x1, p.x2);
			this.x2=Math.max(this.x2, p.x2);
			this.y1=Math.min(this.y1, p.y2);
			this.y2=Math.max(this.y2, p.y2);
		}
		if ('w' in p) {
			this.x2=Math.max(this.x2, this.x1 + p.w);
			this.y2=Math.max(this.y2, this.y1 + p.h);
		}
		this.w = (this.x2 - this.x1);
		this.h = (this.y2 - this.y1);
	}
};


// NodePlacement wraps a single Cyto node object so that we can add layout metadata to it without extending the it.
class NodePlacement {
	constructor(node) {
		this.node = node;
		this.isPlaced = false;
		this.dim = vGraphPositions.layoutDimensions(node);
		this.newPos = {x:undefined, y:undefined}
	}
}

// LayoutGrid is the primary data structure in the layout. The layout can create multiple instances of this class to try various
// deternimistic and stochastic parameters to see which comes out the best. 
// Constructing the object will calculate the layout. Then the getPackingEfficiency() can be called to see how well it performed.
// If its choosen as the best layout, it can be applied with apply()
// Logically it is a row first table with metadata on the table and each row.
//    The table data is in grid.rows[i].cols[j].
//    Table metadata is in grid.*
//    Row metadata is in grid.rows[i].*
//    Each element of cols[] is a reference to nodePlacements[] element which is a cyto node with layout metdata added
class LayoutGrid {
	constructor(parentNode, nodePlacements, targetGridSize) {
		this.parentNode = parentNode;
		this.nodePlacements = nodePlacements;
		this.targetGridSize = targetGridSize;

		// some statistics that we calculate when we iterate the nodes
		this.agregateNodeDims = {w: 0,        h: 0};
		this.maxNodeDims      = {w: 0,        h: 0};
		this.minNodeDims      = {w: Infinity, h: Infinity};

		// iterate the nodes to calc some statistics
		for (var i=0; i<this.nodePlacements.length; i++) {
			var dim = this.nodePlacements[i].dim;
			this.agregateNodeDims.w += dim.w;
			this.agregateNodeDims.h += dim.h;
			this.maxNodeDims.x = Math.max(dim.w, this.maxNodeDims.w);
			this.maxNodeDims.y = Math.max(dim.h, this.maxNodeDims.h);
			this.minNodeDims.x = Math.min(dim.w, this.minNodeDims.w);
			this.minNodeDims.y = Math.min(dim.h, this.minNodeDims.h);
		};

		// if all the nodes were the same size, they would fit into the targetBox (with no spacing)
		this.targetBox = {
			w: Math.trunc((this.agregateNodeDims.w / targetGridSize.cols)*1.1),
			h: Math.trunc((this.agregateNodeDims.h / targetGridSize.rows)*1.1)
		};

		// this is the size that the layout takes up before spacing is added. used to calculate efficiency
		this.boundingBoxNoSpace = {w:0,h:0};

		// this is the size of the bounding box of the actual layout before spacing is added
		this.boundingBox = new BoundingBox();

		// a nominal spacing that is proportional to the average node dimensions
		this.spacing = {
			w: Math.max(15, Math.trunc(this.targetBox.w * 0.1 / targetGridSize.rows)),
			h: Math.max(15, Math.trunc(this.targetBox.h * 0.1 / targetGridSize.cols)),
		}

		// cur keeps track of the location where the next node will be placed
		this.cur = {i:0, j:0};

		// This is the table where the nodes are placed.
		// rows elements are objects with 
		//     cols[]  : array of nodePlacement (shallow copies that reference the ones in the global array)
		//     w       : sum width of nodes in this row w/o space (like if they are all packed to the left)
		//     h       : height of the largest node in this row
		this.rows = [];

		//console.log("!!! LayoutGrid started for "+this.parentNode.id());
		// for (var i=0; i<this.nodePlacements.length; i++)
		//    console.log("      child="+this.nodePlacements[i].node.id());
		//console.log("   agregateNodeDims=("+this.agregateNodeDims.w+","+this.agregateNodeDims.h+")");
		//console.log("   targetGridSize=("+targetGridSize.rows+","+targetGridSize.cols+")");
		//console.log("   targetBox=("+this.targetBox.w+","+this.targetBox.h+")");
		// console.log("   spacing=("+this.spacing.w+","+this.spacing.h+")");


		this._fillGridWithNodes(this.nodePlacements);
	}

	// this is used to judge how good the layout is
	getPackingEfficiency() {
		return (this.targetBox.w * this.targetBox.h) / (this.boundingBoxNoSpace.w * this.boundingBoxNoSpace.h);
	}

	// this fills in the positions associative array with the postitions of not only the nodes being layed out, but also for any
	// that are compound nodes, the positions of all their descendants. The positions array is used to feed the callback that works
	// with the cyto layoutPositions() API call.
	apply(vGraphPositions) {
		var bounds = new BoundingBox();
		for (var i=0; i<this.rows.length; i++) {
			for (var j=0; j<this.rows[i].cols.length; j++) {
				var nodePlacement = this.rows[i].cols[j];
				var posNowRel = vGraphPositions.relativePosition(nodePlacement.node);
				var deltaVector = {
					x: nodePlacement.newPos.x - posNowRel.x,
					y: nodePlacement.newPos.y - posNowRel.y
				};

				vGraphPositions.moveNode(nodePlacement.node, deltaVector);

				vGraphPositions.setBounds(nodePlacement.node, bounds);

				// if node is compound, move all its descendants by the offset since the positions of the children determine the
				// size and position of the parent
				if (nodePlacement.node.isParent()) {
					nodePlacement.node.descendants().nodes().forEach((node) => {
						vGraphPositions.moveNode(node, deltaVector);
					})
				}
			}
		}
		vGraphPositions.setFromBounds(this.parentNode, bounds);
		vGraphPositions.increaseSizeBy(this.parentNode, 22, 22);
	}


	// place the next node and advance cur
	_placeNextNode(nodePlacement) {
		// create new row objects on demand when this.cur points to a non-existant row
		if (!this.rows[this.cur.i])
			this.rows[this.cur.i] = {cols: [], w:0, h:0};

		this.rows[this.cur.i].cols[this.cur.j] = nodePlacement;
		this.cur.j++;
		this.rows[this.cur.i].w += nodePlacement.dim.w;
		this.rows[this.cur.i].h = Math.max(this.rows[this.cur.i].h, nodePlacement.dim.h);

		//console.log("  |placed "+nodePlacement.node.id()+"@("+this.cur.i+","+(this.cur.j-1)+") dim("+nodePlacement.dim.w+","+nodePlacement.dim.h+") r("+this.rows[this.cur.i].w+" of "+this.targetBox.w+" used)");

		this.boundingBoxNoSpace.w = Math.max(this.boundingBoxNoSpace.w, this.rows[this.cur.i].w);
		this.boundingBoxNoSpace.h = 0;
		for (var i=0; i<this.rows.length; i++)
			this.boundingBoxNoSpace.h += this.rows[i].h;

		//console.log("  |row dim=("+this.rows[this.cur.i].w+","+this.rows[this.cur.i].h+")");

		// signal the nodePlacement element that its not available anymore to place 
		nodePlacement.isPlaced = true;
	}

	// move cur to the next row (used like a linefeed when their is no good candidate to add to the existing row)
	_newRow() {
		this.cur.i++;
		this.cur.j=0;
		//console.log("  |newRow=("+this.cur.i+","+this.cur.j+")");
	}

	// will it reasonably fit? (this is a hard yes or no)
	// initially, the idea is that it must fit reasonably well in the x direct
	// if at least 75% of the node width fits in the space left we can consider is a candidate to place next
	_willFitInRow(nodePlacement) {
		return 0.75 < ((this.targetBox.w - this.rows[this.cur.i].w) / nodePlacement.dim.w);
	}

	// get a number from 0 to Infinity where lower numbers are better fits
	// initially, the idea is that the height determines how will it fits  in the existing row
	// the first node in a row is choosen (arbitrarily  at first) and then subsequent try to match it.
	// smaller fits are slightly prefered to larger fits
	_getFitness(nodePlacement) {
		// delta is the differnce in height, positive coresponds to the node being larger than the existing row
		var delta = this.rows[this.cur.i].h - nodePlacement.dim.h;
		if (delta>0) delta *= 3; //we favor not increasing the row height so exagerate positive deltas
		return Math.abs(delta);
	}

	// This is the packing algorithm.
	// The this.targetBox.w(idth) is the primary input to this algorithm.
	//    1) at the start of each new row, the next available node is placed 
	//       (maybe we could add a search to find the 'best' one but initially, its arbitrarily the next available node)
	//    2) subsequent nodes are placed in the row based on...
	//           first, only candidates the at least 75% of their width fit in the remaining row space are elegible
	//           second, elegible candidates are ranked by...
	//                a) how well their height fits in the row 
	//                b) whether how well they either complete the row or leave enough space for another node in the row
	_fillGridWithNodes(nodePlacements) {
		// this loop places nodes until there are no more un-placed nodes in nodePlacements[]
		var itrCount = 0; // to guard against infinite loop bugs
		var placedCount = 0;
		while (placedCount < nodePlacements.length && (itrCount < 3*nodePlacements.length)) {
			if (this.cur.j == 0) {
				// pick the first node in this row arbitrarily (since this is unconditional, the loop should be garanteed to finish)
				for (i=0; i<nodePlacements.length && nodePlacements[i].isPlaced; i++);
				if (nodePlacements[i].isPlaced) throw "logic error in grid placement algorithm"
				this._placeNextNode(nodePlacements[i]);
				placedCount++;
			} else {
				// of the ones that will fit in current row, pick the one that is closest to the existing row height
				var candidates = [];
				for (i=0; i<nodePlacements.length; i++)
					if (!nodePlacements[i].isPlaced)
						if (this._willFitInRow(nodePlacements[i])) {
							candidates.push({ind:i, fitness: this._getFitness(nodePlacements[i])})
						//} else {
							//console.log("wont fit: space left="+(this.targetBox.w - this.rows[this.cur.i].w)+" node width="+nodePlacements[i].dim.w)
						}
				//console.log(candidates.length+" candidates found")
				if (candidates.length > 0) {
					candidates.sort((a,b) => {return a.fitness - b.fitness});
					this._placeNextNode(nodePlacements[candidates[0].ind]);
					placedCount++;
				} else
					this._newRow();
			}
		}

		// calculate each nodePlacement's position now that we know all the row heights
		var nextPosition = {x:0,y:0};
		//console.log("setting positions...");
		for (var i=0; i<this.rows.length; i++) {
			nextPosition.x = 0;
			nextPosition.y += Math.trunc(this.rows[i].h/2);
			for (var j=0; j<this.rows[i].cols.length; j++) {
				var nodePlacement = this.rows[i].cols[j];
				nextPosition.x += Math.trunc(nodePlacement.dim.w/2);
				var heightOffset = (this.rows[i].h - nodePlacement.dim.h)/2;
				//console.log("  |placed["+nodePlacement.node.id()+"]("+i+","+j+")("+nextPosition.x+","+nextPosition.y+")");
				nodePlacement.newPos = {
					x: nextPosition.x,
					y: nextPosition.y
				};
				this.boundingBox.expandToInclude({
					x1: nodePlacement.newPos.x - Math.trunc(nodePlacement.dim.w / 2),
					y1: nodePlacement.newPos.y - Math.trunc(nodePlacement.dim.h / 2),
					x2: nodePlacement.newPos.x + Math.trunc(nodePlacement.dim.w / 2),
					y2: nodePlacement.newPos.y + Math.trunc(nodePlacement.dim.h / 2)
				});
				nextPosition.x += Math.trunc(nodePlacement.dim.w/2 + this.spacing.w);
			}
			nextPosition.y += Math.trunc(this.rows[i].h/2 + this.spacing.h);
		}
		//console.log("this.boundingBox="+util.inspect(this.boundingBox));

		// up to now, we have been working in the first quadrant of our coordinate system but cyto puts the origin in the center
		// of the node so now that we know the this.boundingBox of our completed layout, we can center it on the origin
		var centeringVector = {
			x: - Math.trunc((this.boundingBox.x2 - this.boundingBox.x1)/2),
			y: - Math.trunc((this.boundingBox.y2 - this.boundingBox.y1)/2)
		}
		for (var i=0; i<this.rows.length; i++) {
			for (var j=0; j<this.rows[i].cols.length; j++) {
				var nodePlacement = this.rows[i].cols[j];
				nodePlacement.newPos = {
					x: nodePlacement.newPos.x + centeringVector.x,
					y: nodePlacement.newPos.y + centeringVector.y
				};
			}
		}
		this.boundingBox = {
			x1: this.boundingBox.x1 + centeringVector.x,
			y1: this.boundingBox.y1 + centeringVector.y,
			x2: this.boundingBox.x2 + centeringVector.x,
			y2: this.boundingBox.y2 + centeringVector.y
		}
	}
}



// This layout algorithm places the direct descendants of a compound node into a grid.
// Those child nodes can be compound or not, but the relative interior layout of the compound node is not changed. 
// Cyto does not allow moving a compound node directly so each non-compound descendant of child compound node is 
// moved by the amount that we want to move the compound node which has the effect of moving the compound node.
export class BGCompoundGridLayout {
	constructor( options ) {
		this.options = Object.assign( {}, options );
		this.cy = ('cy' in options) ? options.cy : undefined;

		vGraphPositions.sessionStart();

		if ('forEach' in options.eles) {
			if (options.eles.size() > 1) {
				console.log("The collection has more than one element. options.eles.size()="+options.eles.size())
				throw "The collection has more than one element. This layout can only be called on a single compound node to arrange its immediate children."
			}
			this.parentNode = options.eles.first();
		} else
			this.parentNode = options.eles;

		// build the array of nodes being placed in the grid (direct children of parentNode) -- these may include compounds and non-compounds
		// each element is a NodePlacement object that wraps a node so that we dont have to extend cyto's node object wih our layout info
		this.nodePlacements = [];
		this.parentNode.children().nodes().forEach((node, i) => {
			// TODO: see if these nodes are limitted to the chilren collection or if we can get descendants from them even if those nodes are not in children
			this.nodePlacements[i] = new NodePlacement(node);
		});
	}

	// calculate the target grid node count dimensions. e.g. n x m rows and columns.
	// The idea of 'target' values are that they would be the actual values if all the nodes are uniform in dimension and the node
	// count equals n x m 
	// The actual number of nodes placed in each row will vary from these targets but the algorithm will favor resulting bounding
	// boxes that have the specified aspect ratio or side length.
	// The algorithm always packs filling the width first so when a target height is specified, the width that would ideally produce
	// that height is used to pack the grid. 
	// Either targetRowCount or targetColCount or both can be undefined
	//    neither is provided : the aspect ratio of 1/1 is targeted
	//    both provided       : the aspect ratio of targetColCount / targetRowCount is targeted for the resulting boundingBox
	//                          (they count will be scaled to fit the number of nodes so only the ratio is important)
	//    one or the other    : the average number of nodes in that dimension will be targeted. The boundingBox size in that
	//                          dimension will be approximately that number times the average node size in that dimension
	//                          The other dimension size will grow to accomadate the total number of nodes in the layout.
	normalizeTargetPackingDimensions(numOfNodes, targetRowCount, targetColCount) {
		var target = {};
		if (targetRowCount && targetColCount) {
			var ratio = targetColCount / targetRowCount;
			target.cols = Math.trunc(Math.sqrt(numOfNodes * ratio) + 0.9);
			target.rows = Math.trunc(numOfNodes / target.cols +0.9);
		} else if (targetRowCount) {
			target.rows = targetRowCount;
			target.cols = Math.trunc(numOfNodes / target.rows +0.9);
		} else if (targetColCount) {
			target.cols = targetColCount;
			target.rows = Math.trunc(numOfNodes / target.cols +0.9);
		} else {
			target.rows = Math.trunc(Math.sqrt(numOfNodes) + 0.9);
			target.cols = target.rows;
		}
		return target;
	}

	// run() is the cyto api that the user calls to execute the layout.
	//   1) One or several LayoutGrid objects are created which calculates a candidate layout on nodePlacements given specific
	//        parameters.
	//   2) candidates are compared with LayoutGrid.getPackingEfficiency() and one is choosen
	//   3) LayoutGrid.apply() is called on the choosen LayoutGrid object which builds the positions associative array
	//        positions[node.id()]=centerCoordinate. Even though this layout only moves the direct children, all of the descents
	//        are set because the only way to move a compound node is to shift all of its descendants to a new location. Some 
	//        children might be compound and others might not be but either way, all the descendants should be positioned.
	//   4) Finally, the cytoscape API collection.layoutPositions() is invoked with a callback that feeds the positions from the 
	//        associative array.
	run() {
		// Make the LayoutGrid instance(s)
		var targetGridSize = this.normalizeTargetPackingDimensions(this.nodePlacements.length, this.options.rows, this.options.cols);
		//console.log("     targetGridSize="+util.inspect(targetGridSize));
		var grid = new LayoutGrid(this.parentNode, this.nodePlacements, targetGridSize);

		grid.apply(vGraphPositions);

		vGraphPositions.layoutPositions(this.parentNode.descendants(), this, this.options);

		vGraphPositions.sessionEnd();
	}
}










// This is a helper class for RecursiveCompoundLayout
// It wraps one compound node and is responsible for starting a layout and keeping track of its state
class CompoundNodeWrapper {
	constructor(node, layOutMaster) {
		this.node = node;
		this.layOutMaster = layOutMaster;
		this.state = "waiting"; // waiting, running, done

		this.depth = 0;
		var tNode = this.node;
		while (tNode && tNode !== this.layOutMaster.topNode) {
			this.depth++;
			tNode = tNode.parent();
			if (this.depth > 10) throw "yuk";
		}
		this.lay = null;
	}
}

// This performs layouts on compund nodes asynchronously. It triggers some nyumber of layouts and returns and as the layouts finish,
// it triggers others until they are all done. Nested compound nodes are done from the bottom up?
export class RecursiveCompoundLayout {
	constructor(topNode, onFinished) {
		this.topNode = topNode;
		this.onFinished = onFinished;

		vGraphPositions.sessionStart();

		this.layoutConfig = {
			name: 'BGCompoundGridLayout',
			animate: true, animationDuration: 500, animationEasing: undefined, animateFilter: function ( node, i ){ return true; },
		};

		this.curDepth = 0; // init to the largest value and then work our way down to 0
		this.nodesToLayout = {};
		topNode.or(topNode.descendants(':parent')).forEach((node) => {
			this.nodesToLayout[node.id()] = new CompoundNodeWrapper(node, this);
			this.curDepth = Math.max(this.curDepth, this.nodesToLayout[node.id()].depth);
		})

		for (var nodeWrapper = this.getNextToRun(); nodeWrapper; nodeWrapper = this.getNextToRun()) {
			console.log("   DAL: depth="+nodeWrapper.depth+" laying out "+nodeWrapper.node.id())
			nodeWrapper.state = "done";
			nodeWrapper.node.layout(this.layoutConfig).run();
		}

		this.layoutConfig.stop = () => {
			delete this.nodesToLayout;
			if (this.onFinished)
				this.onFinished();
		}
		this.topNode.layout(this.layoutConfig).run();
		vGraphPositions.sessionEnd();
	}


	// This will return a nodeWrapper whose state is "waiting" and whose depth has the greatest value of any left.
	// For example, if the maxDepth of any node is 4, then each of the 4's will be returned until there are no more 4's and then
	// each of the 3's until no more 3's, and then 2's and finally each of the 1's. 0's are not returned. typically only the
	// topNode is a 0 depth and it is dealt with explicitly at the end.
	getNextToRun() {
		var found = undefined;
		while (!found && this.curDepth > 0) {
			for (nodeID in this.nodesToLayout) {
				if ( !found
					 && this.nodesToLayout[nodeID].depth == this.curDepth
					 && this.nodesToLayout[nodeID].state == "waiting") {
					found = this.nodesToLayout[nodeID];
				}
			};
			if (!found)
				this.curDepth--;
		}
		return found;
	}
}







export let register = function(cytoscape) {
	if (cytoscape)
		cytoscape( 'layout', 'BGCompoundGridLayout', BGCompoundGridLayout );
};

// if( typeof cytoscape !== 'undefined' ){
// 	register( cytoscape );
// }
