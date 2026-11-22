# @gymflow/core

Dominio puro de GymFlow. **Sin I/O**: ni base de datos, ni HTTP, ni reloj del
sistema salvo donde se recibe como argumento.

Esa pureza no es estética. Es lo que permite dos cosas concretas:

1. Las **209 pruebas corren sin base de datos**, en menos de un segundo.
2. El **gateway offline del Sprint 7** ejecutará la misma política de acceso
   que la nube (ADR-015). Si la política dependiera de una consulta, sería
   imposible garantizar que la sucursal y el servidor deciden igual.

## Qué vive aquí

| Módulo | Qué resuelve |
|---|---|
| `money` | `bigint` en centavos, reparto por resto mayor, desglose fiscal. **Nunca `float`** |
| `time` | Fecha de negocio por zona, anclas de facturación, meses de 28/29/30/31 días |
| `permissions` · `authorize` | 63 permisos, alcance por sucursal, límites por rol |
| `membership` | 21 transiciones del contrato socio↔plan |
| `billing` | Estado derivado del cargo, reparto de pagos, idempotencia |
| `cash` | Efectivo esperado, diferencia de caja, folio, antigüedad de cartera |
| `identity` | Normalización de nombre y teléfono, detección de duplicados |
| `audit` | Cadena de hashes SHA-256 |

## Uso

```bash
pnpm install
pnpm build      # emite dist/, que es lo que consumen los demás repos
pnpm verify     # typecheck + lint + 209 pruebas
```

Lo consumen `gymflow-db` y `gymflow-backend` por `file:../gymflow-core`.
Cuando haya remoto, se cambia a etiqueta git o registro sin tocar el código.
