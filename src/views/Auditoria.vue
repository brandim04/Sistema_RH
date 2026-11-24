<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { dataHora, get } from '../servicos';

const lista = ref<any[]>([]);
const entidade = ref('');
const usuario = ref('');
async function carregar() { lista.value = await get(`/auditoria?entidade=${entidade.value}&usuario=${encodeURIComponent(usuario.value)}&limite=300`); }
let t: any;
watch([entidade, usuario], () => { clearTimeout(t); t = setTimeout(carregar, 250); });
onMounted(carregar);
const ENTIDADES = ['colaborador', 'admissao', 'desligamento', 'item', 'tarefa', 'ferias', 'equipamento', 'documento', 'usuario', 'parametro', 'modelo_item', 'modelo_prazo'];
</script>

<template>
  <div>
    <div class="topo"><div><h1>Auditoria</h1><p>Quem fez cada alteração e quando.</p></div></div>
    <div class="cartao">
      <div class="filtros">
        <div class="campo"><label>Entidade</label><select v-model="entidade"><option value="">Todas</option><option v-for="e in ENTIDADES" :key="e" :value="e">{{ e }}</option></select></div>
        <div class="campo" style="flex:1"><label>Usuário (e-mail)</label><input v-model="usuario" /></div>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>
          <tbody>
            <tr v-for="a in lista" :key="a.id">
              <td class="num" style="white-space:nowrap">{{ dataHora(a.criado_em) }}</td>
              <td>{{ a.usuario_email ?? '—' }}</td>
              <td><span class="etiqueta">{{ a.acao }}</span></td>
              <td>{{ a.entidade }}<span v-if="a.entidade_id" class="mudo"> #{{ a.entidade_id }}</span></td>
              <td class="pequeno mudo" style="max-width:420px;word-break:break-word"><code>{{ a.detalhes ? JSON.stringify(a.detalhes) : '' }}</code></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
