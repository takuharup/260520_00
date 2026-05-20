export class FrameParser {
  constructor(content, format = 'auto') {
    this.content = content;
    this.format = format;
    this.lines = content.split('\n');
  }

  parse() {
    try {
      const fmt = this.format === 'auto' ? this.detectFormat() : this.format;
      if (fmt === 'STRUDL') {
        return this.parseSTRUDL();
      } else {
        return this.parseNASTRAN();
      }
    } catch (e) {
      return { format: this.format, grids: [], elements: [], properties: [], materials: [], error: e.message };
    }
  }

  detectFormat() {
    const upper = this.content.toUpperCase();
    if (upper.includes('JOINT COORDINATES') || upper.includes('MEMBER INCIDENCES')) return 'STRUDL';
    if (upper.includes('GRID') || upper.includes('CBAR') || upper.includes('ENDDATA')) return 'NASTRAN_BDF';
    return 'NASTRAN_BDF';
  }

  _fixedCol(line, start, end) {
    return (line.substring(start, end) || '').trim();
  }

  _parseFloat(s) {
    if (!s || s.trim() === '') return 0;
    // Handle NASTRAN scientific notation: 1.23+4 → 1.23e+4, 1.23-4 → 1.23e-4
    s = s.trim().replace(/([0-9])([+-])([0-9])/g, '$1e$2$3');
    const v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  }

  parseNASTRAN() {
    const grids = [];
    const elements = [];
    const properties = [];
    const materials = [];

    const lines = this.lines;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line || line.startsWith('$')) { i++; continue; }

      const keyword = line.substring(0, 8).trim().toUpperCase();

      if (keyword === 'GRID') {
        const id = parseInt(this._fixedCol(line, 8, 16)) || 0;
        const cs = parseInt(this._fixedCol(line, 16, 24)) || 0;
        const x = this._parseFloat(this._fixedCol(line, 24, 32));
        const y = this._parseFloat(this._fixedCol(line, 32, 40));
        const z = this._parseFloat(this._fixedCol(line, 40, 48));
        grids.push({ id, number: id, x, y, z, coord_system: cs });

      } else if (keyword === 'CBAR') {
        const eid = parseInt(this._fixedCol(line, 8, 16)) || 0;
        const pid = parseInt(this._fixedCol(line, 16, 24)) || 0;
        const sg = parseInt(this._fixedCol(line, 24, 32)) || 0;
        const eg = parseInt(this._fixedCol(line, 32, 40)) || 0;
        const wx = this._parseFloat(this._fixedCol(line, 40, 48));
        const wy = this._parseFloat(this._fixedCol(line, 48, 56));
        const wz = this._parseFloat(this._fixedCol(line, 56, 64));
        elements.push({ id: eid, number: eid, property_id: pid, start_grid: sg, end_grid: eg, y_axis: [wx, wy, wz] });

      } else if (keyword === 'CBEAM') {
        const eid = parseInt(this._fixedCol(line, 8, 16)) || 0;
        const pid = parseInt(this._fixedCol(line, 16, 24)) || 0;
        const sg = parseInt(this._fixedCol(line, 24, 32)) || 0;
        const eg = parseInt(this._fixedCol(line, 32, 40)) || 0;
        elements.push({ id: eid, number: eid, property_id: pid, start_grid: sg, end_grid: eg, y_axis: [0, 1, 0] });

      } else if (keyword === 'PBAR' || keyword === 'PBEAM') {
        const pid = parseInt(this._fixedCol(line, 8, 16)) || 0;
        const mid = parseInt(this._fixedCol(line, 16, 24)) || 0;
        const ax = this._parseFloat(this._fixedCol(line, 24, 32));
        const i1 = this._parseFloat(this._fixedCol(line, 32, 40));
        const i2 = this._parseFloat(this._fixedCol(line, 40, 48));
        const j = this._parseFloat(this._fixedCol(line, 48, 56));
        let ay = 0, az = 0;
        if (i + 1 < lines.length && lines[i + 1].startsWith('+')) {
          i++;
          const cont = lines[i];
          ay = this._parseFloat(this._fixedCol(cont, 24, 32));
          az = this._parseFloat(this._fixedCol(cont, 32, 40));
        }
        properties.push({ id: pid, number: pid, material_id: mid, ax, ay, az, ix: j, iy: i1, iz: i2 });

      } else if (keyword === 'MAT1') {
        const mid = parseInt(this._fixedCol(line, 8, 16)) || 0;
        const rho = this._parseFloat(this._fixedCol(line, 56, 64));
        materials.push({ id: mid, density: rho, name: 'MAT1_' + mid });
      }

      i++;
    }

    const format = 'NASTRAN_BDF';
    if (grids.length === 0 && elements.length === 0) {
      return { format, grids, elements, properties, materials, error: 'No GRID or CBAR data found in file.' };
    }
    return { format, grids, elements, properties, materials, error: null };
  }

  parseSTRUDL() {
    const grids = [];
    const elements = [];
    const properties = [];
    const materials = [];

    const lines = this.lines;
    let section = null;
    let idCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const upper = raw.toUpperCase().trim();

      if (upper.includes('JOINT COORDINATES')) { section = 'JOINTS'; continue; }
      if (upper.includes('MEMBER INCIDENCES')) { section = 'INCIDENCES'; continue; }
      if (upper.includes('MEMBER PROPERTIES')) { section = 'PROPERTIES'; continue; }
      if (upper === 'FIN' || upper === 'FINISH') { section = null; continue; }
      if (upper.startsWith('LOADING') || upper.startsWith('CONSTANTS') || upper.startsWith('SUPPORT')) {
        section = null; continue;
      }

      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('$')) continue;

      const parts = trimmed.split(/\s+/).filter(p => p !== '');

      if (section === 'JOINTS' && parts.length >= 4) {
        const id = parseInt(parts[0]);
        if (!isNaN(id)) {
          grids.push({ id, number: id, x: parseFloat(parts[1]) || 0, y: parseFloat(parts[2]) || 0, z: parseFloat(parts[3]) || 0, coord_system: 0 });
        }
      } else if (section === 'INCIDENCES' && parts.length >= 3) {
        const id = parseInt(parts[0]);
        const sg = parseInt(parts[1]);
        const eg = parseInt(parts[2]);
        if (!isNaN(id) && !isNaN(sg) && !isNaN(eg)) {
          elements.push({ id, number: id, property_id: 1, start_grid: sg, end_grid: eg, y_axis: [0, 1, 0] });
        }
      } else if (section === 'PROPERTIES') {
        if (parts.includes('TO') && parts.length >= 8) {
          const fromId = parseInt(parts[0]);
          const toId = parseInt(parts[2]);
          const ax = parseFloat(parts[3]) || 0;
          const ay = parseFloat(parts[4]) || 0;
          const az = parseFloat(parts[5]) || 0;
          const ix = parseFloat(parts[6]) || 0;
          const iy = parseFloat(parts[7]) || 0;
          const iz = parts[8] ? parseFloat(parts[8]) || 0 : 0;
          for (let mid = fromId; mid <= toId; mid++) {
            properties.push({ id: idCounter++, number: mid, material_id: 1, ax, ay, az, ix, iy, iz });
          }
        } else if (parts.length >= 7 && !isNaN(parseInt(parts[0]))) {
          const pid = parseInt(parts[0]);
          const ax = parseFloat(parts[1]) || 0;
          const ay = parseFloat(parts[2]) || 0;
          const az = parseFloat(parts[3]) || 0;
          const ix = parseFloat(parts[4]) || 0;
          const iy = parseFloat(parts[5]) || 0;
          const iz = parseFloat(parts[6]) || 0;
          properties.push({ id: idCounter++, number: pid, material_id: 1, ax, ay, az, ix, iy, iz });
        }
      }
    }

    const format = 'STRUDL';
    if (grids.length === 0 && elements.length === 0) {
      return { format, grids, elements, properties, materials, error: 'No joint or member data found in file.' };
    }
    return { format, grids, elements, properties, materials, error: null };
  }
}
