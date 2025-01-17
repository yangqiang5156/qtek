define(function (require) {

    'use strict';

    var Base = require('../core/Base');

    /**
     * @constructor qtek.compositor.Graph
     * @extends qtek.core.Base
     */
    var Graph = Base.derive(function () {
        return /** @lends qtek.compositor.Graph# */ {
            /**
             * @type {Array.<qtek.compositor.Node>}
             */
            nodes: []
        };
    },
    /** @lends qtek.compositor.Graph.prototype */
    {
        /**
         * @param {qtek.compositor.Node} node
         */
        addNode: function (node) {

            this.nodes.push(node);

            this._dirty = true;
        },
        /**
         * @param  {qtek.compositor.Node} node
         */
        removeNode: function (node) {
            this.nodes.splice(this.nodes.indexOf(node), 1);

            this._dirty = true;
        },
        /**
         * @param {string} name
         * @return {qtek.compositor.Node}
         */
        getNodeByName: function (name) {
            for (var i = 0; i < this.nodes.length; i++) {
                if (this.nodes[i].name === name) {
                    return this.nodes[i];
                }
            }
        },
        /**
         * Update links of graph
         */
        update: function () {
            for (var i = 0; i < this.nodes.length; i++) {
                this.nodes[i].clear();
            }
            // Traverse all the nodes and build the graph
            for (var i = 0; i < this.nodes.length; i++) {
                var node = this.nodes[i];

                if (!node.inputs) {
                    continue;
                }
                for (var inputName in node.inputs) {
                    if (!node.inputs[inputName]) {
                        continue;
                    }
                    if (node.pass && !node.pass.material.isUniformEnabled(inputName)) {
                        console.warn('Pin '  + node.name + '.' + inputName + ' not used.');
                    }
                    var fromPinInfo = node.inputs[inputName];

                    var fromPin = this.findPin(fromPinInfo);
                    if (fromPin) {
                        node.link(inputName, fromPin.node, fromPin.pin);
                    }
                    else {
                        if (typeof fromPinInfo === 'string') {
                            console.warn('Node ' + fromPinInfo + ' not exist');
                        }
                        else {
                            console.warn('Pin of ' + fromPinInfo.node + '.' + fromPinInfo.pin + ' not exist');
                        }
                    }
                }
            }
        },

        findPin: function (input) {
            var node;
            // Try to take input as a directly a node if node parameter not exist
            // PENDING
            if (!input.node) {
                input = {
                    node: input
                };
            }


            if (typeof input.node === 'string') {
                for (var i = 0; i < this.nodes.length; i++) {
                    var tmp = this.nodes[i];
                    if (tmp.name === input.node) {
                        node = tmp;
                    }
                }
            }
            else {
                node = input.node;
            }
            if (node) {
                if (!input.pin) {
                    // Use first pin defaultly
                    input.pin = Object.keys(node.outputs)[0];
                }
                if (node.outputs[input.pin]) {
                    return {
                        node: node,
                        pin: input.pin
                    };
                }
            }
        }
    });

    return Graph;
});