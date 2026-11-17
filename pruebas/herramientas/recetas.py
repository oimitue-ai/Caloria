#!/usr/bin/env python3
"""Recalcula platillos de datos/recetas_mx.json desde el JSON oficial USDA (independiente del pipeline) y lo compara
con lo publicado en public/catalogo/base. Uso: python3 -I pruebas/herramientas/recetas.py [id ...]
ml → g: densidad = gramWeight / ml de la porción oficial "cup" (1 cup = 236.588 ml) o "fl oz" (29.5735 ml)."""
import glob, json, os, sys, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from fuente import usda  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
recetas = json.load(open(os.path.join(RAIZ, 'datos', 'recetas_mx.json')))['recetas']
pub = {}
for f in glob.glob(os.path.join(RAIZ, 'public/catalogo/base/detalle-*.json')):
    pub.update(json.load(open(f)))
quiero = sys.argv[1:] or ['licuado-platano', 'pozole-rojo-plato', 'barbacoa-res']
for rid in quiero:
    rec = next(r for r in recetas if r['id'] == rid)
    por = {}
    for i in rec['ingredientes']:
        f, _, n = i['id'].partition(':')
        por.setdefault(f, []).append(n)
    of = {}
    for f, l in por.items():
        of.update(usda(f, l))
    tot = {'kcal': 0, 'proteina': 0, 'carbohidratos': 0, 'grasa': 0}
    peso = 0
    for i in rec['ingredientes']:
        o = of[i['id']]
        g = i.get('g')
        if g is None:
            dens = None
            for desc, gw in o.get('porciones', []):
                d = desc.lower()
                if 'fl oz' in d:
                    dens = gw / 29.5735
                    break
                if 'cup' in d and dens is None:
                    dens = gw / 236.588
            g = i['ml'] * dens
        peso += g
        for k in tot:
            tot[k] += (o.get(k) or 0) * g / 100
    peso *= rec['factorCoccion']['valor']
    app = pub['caloria_recetas:' + rid]['nutrientes']
    print(json.dumps({'id': rid, 'pesoTotal_g': round(peso, 1), 'porcion_app': pub['caloria_recetas:' + rid]['porciones'][0],
                      'por100_calculado': {k: round(v / peso * 100, 2) for k, v in tot.items()},
                      'por100_app': {k: app.get(k) for k in tot}}, ensure_ascii=False))
