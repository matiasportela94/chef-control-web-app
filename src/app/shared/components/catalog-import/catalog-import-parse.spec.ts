import { ImportLabels, buildInterpretSheets, normalizeHeader, parseArNumber, parseCatalogWorkbook } from './catalog-import-parse';

const labels: ImportLabels = {
  sheets: { PRODUCTS: 'Insumos', PREPARATIONS: 'Preparaciones', RECIPES: 'Recetas' },
  columns: {
    name: 'Nombre', unit: 'Unidad', category: 'Categoría', minStock: 'Stock mínimo', yieldPercentage: 'Rendimiento %', ivaPercentage: 'IVA %',
    menuItem: 'Plato', price: 'Precio de venta', section: 'Paso del menú', ingredient: 'Ingrediente',
    quantity: 'Cantidad (para 1 plato)', preparation: 'Preparación', yieldQuantity: 'Rinde', yieldUnit: 'Unidad del rinde',
  },
};

describe('parseArNumber', () => {
  it('lee números y texto en formato argentino', () => {
    expect(parseArNumber(1.5)).toBe(1.5);
    expect(parseArNumber('1.234,5')).toBe(1234.5);
    expect(parseArNumber('1,5')).toBe(1.5);
    expect(parseArNumber('1.234.567')).toBe(1234567);
    expect(parseArNumber('$ 12.400')).toBe(12400);
    expect(parseArNumber('90%')).toBe(90);
    expect(parseArNumber('-3')).toBe(-3);
    expect(parseArNumber(' 200 ')).toBe(200);
  });

  it('vacío es undefined', () => {
    expect(parseArNumber(null)).toBeUndefined();
    expect(parseArNumber('  ')).toBeUndefined();
  });

  it('lo ilegible es NaN', () => {
    for (const bad of ['abc', '1.5', '1,2,3', '12.34', '1.2345', true, new Date()]) {
      expect(parseArNumber(bad as any)).withContext(String(bad)).toBeNaN();
    }
  });
});

describe('normalizeHeader', () => {
  it('ignora mayúsculas, acentos, asteriscos y paréntesis', () => {
    expect(normalizeHeader('Stock mínimo')).toBe('stock minimo');
    expect(normalizeHeader('STOCK MINIMO*')).toBe('stock minimo');
    expect(normalizeHeader('Cantidad (para 1 plato)*')).toBe('cantidad');
    expect(normalizeHeader('Rendimiento %')).toBe('rendimiento');
  });
});

describe('parseCatalogWorkbook', () => {
  it('mapea por encabezado, saltea filas vacías e informa la fila del Excel', () => {
    const parsed = parseCatalogWorkbook([
      { sheet: 'INSUMOS', data: [
        ['Unidad*', 'Nombre*', 'Rendimiento %'],   // columnas en otro orden
        ['kg', 'Papa', '90'],
        [null, null, null],
        ['kg', 'Tomate', 'abc'],
      ] },
      { sheet: 'Recetas', data: [
        ['Plato*', 'Ingrediente*', 'Cantidad (para 1 plato)*', 'Unidad*', 'Precio de venta'],
        ['Puré', 'Papa', '0,25', 'kg', '8.500'],
      ] },
    ], labels, true);

    expect(parsed.problems).toEqual([]);
    expect(parsed.products).toEqual([
      { row: 2, name: 'Papa', unit: 'kg', yieldPercentage: 90 },
      { row: 4, name: 'Tomate', unit: 'kg' },
    ]);
    expect(parsed.errors).toEqual([
      { sheet: 'PRODUCTS', row: 4, field: 'yieldPercentage', errorCode: 'UNREADABLE_NUMBER', value: 'abc' },
    ]);
    expect(parsed.recipes).toEqual([
      { row: 2, menuItem: 'Puré', ingredient: 'Papa', quantity: 0.25, unit: 'kg', price: 8500 },
    ]);
  });

  it('lee la columna opcional IVA % como "21", "10,5", "21%" o una celda de porcentaje', () => {
    const parsed = parseCatalogWorkbook([
      { sheet: 'Insumos', data: [
        ['Nombre*', 'Unidad*', 'IVA %'],
        ['Papa', 'kg', '10,5'],
        ['Aceite', 'l', '21%'],
        ['Carne', 'kg', 21],
        ['Vino', 'l', 0.27],       // Excel con formato %: 27 % se guarda 0,27
        ['Sal', 'kg', 0],
        ['Agua', 'l', null],
        ['Pan', 'kg', 'veinte'],
      ] },
    ], labels, false);
    expect(parsed.products.map(p => p.ivaPercentage)).toEqual([10.5, 21, 21, 27, 0, undefined, undefined]);
    expect(parsed.errors).toEqual([
      { sheet: 'PRODUCTS', row: 8, field: 'ivaPercentage', errorCode: 'UNREADABLE_NUMBER', value: 'veinte' },
    ]);
  });

  it('sin el plan de recetas no lee la hoja Recetas', () => {
    const parsed = parseCatalogWorkbook([
      { sheet: 'Insumos', data: [['Nombre', 'Unidad'], ['Papa', 'kg']] },
      { sheet: 'Recetas', data: [['Plato'], ['Puré']] },   // le faltan columnas: no importa, no se lee
    ], labels, false);
    expect(parsed.problems).toEqual([]);
    expect(parsed.recipes).toEqual([]);
    expect(parsed.products.length).toBe(1);
  });

  it('avisa columnas obligatorias que faltan y hojas que no están', () => {
    expect(parseCatalogWorkbook([{ sheet: 'Insumos', data: [['Nombre'], ['Papa']] }], labels, true).problems)
      .toEqual([{ key: 'import.missingColumns', params: { sheet: 'Insumos', columns: 'Unidad' } }]);
    expect(parseCatalogWorkbook([{ sheet: 'Hoja1', data: [['x']] }], labels, true).problems[0].key).toBe('import.noSheets');
    expect(parseCatalogWorkbook([{ sheet: 'Insumos', data: [['Nombre', 'Unidad']] }], labels, true).problems[0].key)
      .toBe('import.empty');
  });

  it('lee la hoja Preparaciones solo si se pide, con el rinde en la primera fila y "Cantidad (para la tanda)"', () => {
    const book = [{ sheet: 'Preparaciones', data: [
      ['Preparación*', 'Rinde', 'Unidad del rinde', 'Ingrediente*', 'Cantidad (para la tanda)*', 'Unidad*'],
      ['Mayonesa base', '1,5', 'kg', 'Huevo', 4, 'u'],
      ['Mayonesa base', null, null, 'Aceite', 800, 'ml'],
    ] }];
    expect(parseCatalogWorkbook(book, labels, true).problems[0].key).toBe('import.noSheets');
    const parsed = parseCatalogWorkbook(book, labels, true, true);
    expect(parsed.problems).toEqual([]);
    expect(parsed.preparations).toEqual([
      { row: 2, preparation: 'Mayonesa base', yieldQuantity: 1.5, yieldUnit: 'kg', ingredient: 'Huevo', quantity: 4, unit: 'u' },
      { row: 3, preparation: 'Mayonesa base', ingredient: 'Aceite', quantity: 800, unit: 'ml' },
    ] as any);
  });

  it('corta antes de mandar si hay más filas que el tope del backend', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [`P${i}`, 'kg']);
    const parsed = parseCatalogWorkbook([{ sheet: 'Insumos', data: [['Nombre', 'Unidad'], ...rows] }], labels, true);
    expect(parsed.problems).toEqual([{ key: 'import.tooManyRows', params: { sheet: 'Insumos', max: 1000 } }]);
  });
});

describe('buildInterpretSheets', () => {
  it('numera las filas con datos en todas las hojas y recuerda de dónde salió cada una', () => {
    const { sheets, refs, rowCount } = buildInterpretSheets([
      { sheet: 'Stock', data: [['Producto', 'Precio'], [null, null], ['Papa', 1200.5, null, null]] },
      { sheet: 'Vacía', data: [[null], ['  ']] },
      { sheet: 'Platos', data: [[null], ['Puré', '1.500', true]] },
    ]);
    expect(rowCount).toBe(3);
    expect(sheets).toEqual([
      { name: 'Stock', rows: [{ ref: 1, cells: ['Producto', 'Precio'] }, { ref: 2, cells: ['Papa', 1200.5] }] },
      { name: 'Platos', rows: [{ ref: 3, cells: ['Puré', '1.500', 'true'] }] },
    ]);
    expect(refs.get(2)).toEqual({ sheet: 'Stock', row: 3 });
    expect(refs.get(3)).toEqual({ sheet: 'Platos', row: 2 });
  });
});
