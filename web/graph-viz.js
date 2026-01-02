/**
 * LiteGraph - Force-Directed Graph Visualization
 * 
 * A lightweight, interactive graph visualizer using HTML5 Canvas.
 * Features:
 * - Force-directed layout (nodes repel, edges attract)
 * - Drag and drop nodes
 * - Zoom and pan
 * - Color-coded labels
 * - Relationship type display
 */

class GraphVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Visualization state
        this.nodes = [];
        this.edges = [];
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Interaction state
        this.isDragging = false;
        this.dragNode = null;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Physics settings
        this.repulsion = 5000;
        this.attraction = 0.01;
        this.damping = 0.9;
        this.centerForce = 0.01;

        // Visual settings
        this.nodeRadius = 25;
        this.labelColors = {};
        this.colorPalette = [
            '#58a6ff', '#7ee787', '#a371f7', '#f778ba', '#ffa657',
            '#79c0ff', '#56d364', '#bc8cff', '#ff9bce', '#ffc680'
        ];
        this.colorIndex = 0;

        // Animation
        this.animationId = null;
        this.isSimulating = false;

        this.setupEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    }

    // Convert screen coordinates to world coordinates
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.canvas.width / 2 - this.offsetX) / this.scale,
            y: (screenY - this.canvas.height / 2 - this.offsetY) / this.scale
        };
    }

    // Convert world coordinates to screen coordinates
    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.canvas.width / 2 + this.offsetX,
            y: worldY * this.scale + this.canvas.height / 2 + this.offsetY
        };
    }

    getNodeAtPosition(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        for (const node of this.nodes) {
            const dx = node.x - world.x;
            const dy = node.y - world.y;
            if (dx * dx + dy * dy < this.nodeRadius * this.nodeRadius) {
                return node;
            }
        }
        return null;
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const node = this.getNodeAtPosition(x, y);
        if (node) {
            this.isDragging = true;
            this.dragNode = node;
            node.pinned = true;
        } else {
            this.isPanning = true;
        }

        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging && this.dragNode) {
            const world = this.screenToWorld(x, y);
            this.dragNode.x = world.x;
            this.dragNode.y = world.y;
            this.dragNode.vx = 0;
            this.dragNode.vy = 0;
            this.render();
        } else if (this.isPanning) {
            this.offsetX += x - this.lastMouseX;
            this.offsetY += y - this.lastMouseY;
            this.render();
        }

        this.lastMouseX = x;
        this.lastMouseY = y;

        // Update cursor
        const node = this.getNodeAtPosition(x, y);
        this.canvas.style.cursor = node ? 'grab' : 'default';
    }

    onMouseUp() {
        if (this.dragNode) {
            this.dragNode.pinned = false;
        }
        this.isDragging = false;
        this.dragNode = null;
        this.isPanning = false;
    }

    onWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale *= zoomFactor;
        this.scale = Math.max(0.1, Math.min(5, this.scale));
        this.render();
    }

    onDoubleClick(e) {
        // Reset view on double click
        this.recenter();
    }

    zoomIn() {
        this.scale *= 1.2;
        this.scale = Math.min(5, this.scale);
        this.render();
    }

    zoomOut() {
        this.scale *= 0.8;
        this.scale = Math.max(0.1, this.scale);
        this.render();
    }

    recenter() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.render();
    }

    getLabelColor(label) {
        if (!this.labelColors[label]) {
            this.labelColors[label] = this.colorPalette[this.colorIndex % this.colorPalette.length];
            this.colorIndex++;
        }
        return this.labelColors[label];
    }

    setData(graphNodes, graphRelationships) {
        // Create visualization nodes from graph nodes
        this.nodes = graphNodes.map((node, i) => {
            // Spread nodes in a circle initially
            const angle = (2 * Math.PI * i) / graphNodes.length;
            const radius = 100 + Math.random() * 50;

            return {
                id: node.id,
                label: Array.from(node.labels)[0] || 'Node',
                name: node.properties.get('name') || `Node ${node.id}`,
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                vx: 0,
                vy: 0,
                pinned: false,
                data: node
            };
        });

        // Create visualization edges
        this.edges = graphRelationships.map(rel => ({
            source: this.nodes.find(n => n.id === rel.startNode.id),
            target: this.nodes.find(n => n.id === rel.endNode.id),
            type: rel.type,
            data: rel
        })).filter(e => e.source && e.target);

        // Reset colors for consistency
        this.labelColors = {};
        this.colorIndex = 0;

        // Run physics simulation
        this.startSimulation();

        // Update legend
        this.updateLegend();
    }

    updateLegend() {
        const legendEl = document.getElementById('graph-legend');
        if (!legendEl) return;

        const labels = [...new Set(this.nodes.map(n => n.label))];
        legendEl.innerHTML = labels.map(label => `
            <div class="legend-item">
                <span class="legend-color" style="background: ${this.getLabelColor(label)}"></span>
                <span class="legend-label">${label}</span>
            </div>
        `).join('');
    }

    startSimulation() {
        this.isSimulating = true;
        this.simulationSteps = 0;
        this.simulate();
    }

    stopSimulation() {
        this.isSimulating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    simulate() {
        if (!this.isSimulating) return;

        this.simulationSteps++;

        // Apply forces
        this.applyForces();

        // Update positions
        for (const node of this.nodes) {
            if (node.pinned) continue;

            node.vx *= this.damping;
            node.vy *= this.damping;
            node.x += node.vx;
            node.y += node.vy;
        }

        // Render
        this.render();

        // Stop after enough steps or when stable
        if (this.simulationSteps < 300) {
            this.animationId = requestAnimationFrame(() => this.simulate());
        } else {
            this.isSimulating = false;
        }
    }

    applyForces() {
        // Repulsion between all nodes
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const a = this.nodes[i];
                const b = this.nodes[j];

                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;

                const force = this.repulsion / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
                if (!b.pinned) { b.vx += fx; b.vy += fy; }
            }
        }

        // Attraction along edges
        for (const edge of this.edges) {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const force = dist * this.attraction;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (!edge.source.pinned) { edge.source.vx += fx; edge.source.vy += fy; }
            if (!edge.target.pinned) { edge.target.vx -= fx; edge.target.vy -= fy; }
        }

        // Center gravity
        for (const node of this.nodes) {
            if (node.pinned) continue;
            node.vx -= node.x * this.centerForce;
            node.vy -= node.y * this.centerForce;
        }
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, width, height);

        // Draw grid (subtle)
        this.drawGrid();

        // Draw edges
        for (const edge of this.edges) {
            this.drawEdge(edge);
        }

        // Draw nodes
        for (const node of this.nodes) {
            this.drawNode(node);
        }
    }

    drawGrid() {
        const ctx = this.ctx;
        const gridSize = 50 * this.scale;

        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;

        const offsetX = (this.offsetX % gridSize + this.canvas.width / 2 % gridSize);
        const offsetY = (this.offsetY % gridSize + this.canvas.height / 2 % gridSize);

        for (let x = offsetX; x < this.canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }

        for (let y = offsetY; y < this.canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
    }

    drawEdge(edge) {
        const ctx = this.ctx;
        const source = this.worldToScreen(edge.source.x, edge.source.y);
        const target = this.worldToScreen(edge.target.x, edge.target.y);

        // Calculate direction
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / dist;
        const ny = dy / dist;

        // Adjust for node radius
        const radius = this.nodeRadius * this.scale;
        const startX = source.x + nx * radius;
        const startY = source.y + ny * radius;
        const endX = target.x - nx * radius;
        const endY = target.y - ny * radius;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#6e7681';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw arrow
        const arrowSize = 10;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle - Math.PI / 6),
            endY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            endX - arrowSize * Math.cos(angle + Math.PI / 6),
            endY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = '#6e7681';
        ctx.fill();

        // Draw relationship type
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        ctx.font = '10px Inter';
        ctx.fillStyle = '#8b949e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Background for text
        const textWidth = ctx.measureText(edge.type).width;
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(midX - textWidth / 2 - 4, midY - 8, textWidth + 8, 16);

        ctx.fillStyle = '#8b949e';
        ctx.fillText(edge.type, midX, midY);
    }

    drawNode(node) {
        const ctx = this.ctx;
        const screen = this.worldToScreen(node.x, node.y);
        const radius = this.nodeRadius * this.scale;

        const color = this.getLabelColor(node.label);

        // Glow effect
        const gradient = ctx.createRadialGradient(
            screen.x, screen.y, radius * 0.5,
            screen.x, screen.y, radius * 2
        );
        gradient.addColorStop(0, color + '40');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Node circle
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#161b22';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Node label
        ctx.font = `bold ${11 * this.scale}px Inter`;
        ctx.fillStyle = '#f0f6fc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Truncate name if too long
        let displayName = node.name;
        if (displayName.length > 8) {
            displayName = displayName.substring(0, 7) + '…';
        }
        ctx.fillText(displayName, screen.x, screen.y);

        // Label badge below
        const labelText = node.label;
        ctx.font = `${9 * this.scale}px Inter`;
        const labelWidth = ctx.measureText(labelText).width;

        const badgeY = screen.y + radius + 10 * this.scale;
        ctx.fillStyle = color + '30';
        ctx.beginPath();
        ctx.roundRect(screen.x - labelWidth / 2 - 4, badgeY - 8, labelWidth + 8, 14, 4);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.fillText(labelText, screen.x, badgeY);
    }
}

// Make it globally available
window.GraphVisualizer = GraphVisualizer;
