<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { exportarExcel } from '../excel';
import { cor, data, get, patch, pode, rotulo, tentar } from '../servicos';

const router = useRouter();
const lista = ref<any[]>([]);
const situacao = ref('');
const responsavel = ref('');
async function carregar() { lista.value = await get(`/tarefas?situacao=${situacao.value}&responsavel=${encodeURIComponent(responsavel.value)}`); }
let t: any;
watch([situacao, responsavel], () => { clearTimeout(t); t = setTimeout(carregar, 250); });
onMounted(carregar);

async function alternar(x: any) { if (await tentar(() => patch(`/tarefas/${x.id}`, { concluida: !x.concluida }))) carregar(); }
function exportar() {
  exportarExcel('prazos-admissoes.xlsx', 'Prazos', [
    { titulo: 'Pessoa', campo: 'colaborador', largura: 28 }, { titulo: '1º dia', campo: 'data_referencia', formato: data },
    { titulo: 'Etapa', campo: 'etapa', largura: 44 }, { titulo: 'Data limite', campo: 'data_limite', formato: data },
    { titulo: 'Dia da semana', campo: 'dia_semana' }, { titulo: 'Responsável', campo: 'responsavel', largura: 24 },
    { titulo: 'Responsável final', campo: 'responsavel_final', largura: 28 }, { titulo: 'Situação', campo: 'situacao', formato: (v) => rotulo('prazo', v) },
  ], lista.value);
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Prazos e tarefas</h1><p>Etapas de todas as admissões em andamento, com data limite e responsável (RF22–RF29).</p></div>
      <div class="acoes"><button @click="exportar">Exportar Excel</button></div>
    </div>
    <div class="cartao">
      <div class="filtros">
        <div class="campo"><label>Situação</label><select v-model="situacao"><option value="">Todas</option><option v-for="s in ['ATRASADA', 'VENCE_EM_BREVE', 'NO_PRAZO', 'CONCLUIDA']" :key="s" :value="s">{{ rotulo('prazo', s) }}</option></select></div>
        <div class="campo" style="flex:1"><label>Responsável</label><input v-model="responsavel" placeholder="Ex.: Recruiter, Departamento Pessoal…" /></div>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th></th><th>Data limite</th><th>Dia</th><th>Etapa</th><th>Pessoa</th><th>Responsável</th><th>Situação</th></tr></thead>
          <tbody>
            <tr v-for="x in lista" :key="x.id">
              <td><input type="checkbox" :checked="x.concluida" :disabled="!pode('processo:escrever')" :aria-label="`Concluir ${x.etapa}`" @change="alternar(x)" /></td>
              <td class="num">{{ data(x.data_limite) }}</td>
              <td>{{ x.dia_semana }}</td>
              <td>{{ x.etapa }}</td>
              <td><a href="#" @click.prevent="router.push(`/admissoes/${x.admissao_id}`)">{{ x.colaborador }}</a></td>
              <td>{{ x.responsavel }}<div v-if="x.responsavel_final" class="mudo pequeno">{{ x.responsavel_final }}</div></td>
              <td><span class="etiqueta" :class="cor('prazo', x.situacao)">{{ rotulo('prazo', x.situacao) }}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!lista.length" class="vazio">Nenhuma tarefa encontrada.</div>
      </div>
    </div>
  </div>
</template>
