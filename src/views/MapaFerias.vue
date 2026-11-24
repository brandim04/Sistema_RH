<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { exportarExcel } from '../excel';
import { get } from '../servicos';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const router = useRouter();
const ano = ref(new Date().getFullYear());
const area = ref('');
const busca = ref('');
const areas = ref<any[]>([]);
const m = ref<any>(null);
async function carregar() { m.value = await get(`/ferias/mapa?ano=${ano.value}&area_id=${area.value}&busca=${encodeURIComponent(busca.value)}`); }
let t: any;
watch([ano, area, busca], () => { clearTimeout(t); t = setTimeout(carregar, 250); });
onMounted(async () => { areas.value = await get('/areas'); carregar(); });
const classe = (d: number) => (d === 0 ? '' : d <= 7 ? 'd1' : d <= 14 ? 'd2' : d <= 21 ? 'd3' : 'd4');

function exportar() {
  const cols = [{ titulo: 'Colaborador(a)', campo: 'nome', largura: 28 }, { titulo: 'Área', campo: 'area' },
    ...MESES.map((mm, i) => ({ titulo: mm, campo: `m${i}`, largura: 7 }))];
  exportarExcel(`mapa-ferias-${ano.value}.xlsx`, `Mapa ${ano.value}`, cols,
    m.value.linhas.map((l: any) => ({ ...l, ...Object.fromEntries(l.meses.map((v: number, i: number) => [`m${i}`, v || ''])) })));
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Mapa de férias</h1><p>Dias de férias programadas por mês. Atualizado automaticamente a cada registro, alteração ou cancelamento.</p></div>
      <div class="acoes"><button @click="exportar" :disabled="!m">Exportar Excel</button></div>
    </div>
    <div class="cartao">
      <div class="filtros">
        <div class="campo"><label>Ano</label><input v-model.number="ano" type="number" min="2000" max="2100" style="width:110px" /></div>
        <div class="campo"><label>Área</label><select v-model="area"><option value="">Todas</option><option v-for="a in areas" :key="a.id" :value="a.id">{{ a.nome }}</option></select></div>
        <div class="campo" style="flex:1"><label>Nome</label><input v-model="busca" placeholder="Filtrar por nome" /></div>
      </div>
      <div v-if="m" class="tabela-rolagem">
        <table class="mapa">
          <thead><tr><th>Colaborador(a)</th><th>Área</th><th v-for="mm in MESES" :key="mm" style="text-align:center">{{ mm }}</th></tr></thead>
          <tbody>
            <tr v-for="l in m.linhas" :key="l.colaborador_id" class="clicavel" @click="router.push(`/ferias/${l.colaborador_id}`)">
              <td><strong>{{ l.nome }}</strong></td><td class="mudo">{{ l.area ?? '—' }}</td>
              <td v-for="(d, i) in (l.meses as number[])" :key="i" class="mes num" :class="classe(d)" :title="d ? `${d} dias em ${MESES[Number(i)]}` : ''">{{ d || '' }}</td>
            </tr>
            <tr v-if="m.linhas.length"><td colspan="2" class="mudo pequeno">Pessoas em férias no mês</td><td v-for="(n, i) in m.pessoas_por_mes" :key="i" class="mes num mudo">{{ n || '' }}</td></tr>
          </tbody>
        </table>
        <div v-if="!m.linhas.length" class="vazio">Nenhuma férias programada em {{ ano }} com esses filtros.</div>
      </div>
      <p class="mudo pequeno" style="margin-top:10px">Legenda: tom mais escuro = mais dias no mês (1–7, 8–14, 15–21, 22+).</p>
    </div>
  </div>
</template>
