<script setup lang="ts">
/** Configurações sem alteração de código-fonte (RNF06): checklists, modalidades, prazos, parâmetros e áreas. */
import { computed, onMounted, ref, watch } from 'vue';
import { confirmar, del, get, pedirTexto, post, put, tentar } from '../servicos';

const aba = ref<'admissao' | 'desligamento' | 'modalidades' | 'prazos' | 'parametros' | 'areas'>('admissao');

// ---------- Modelos de checklist ----------
const itens = ref<any[]>([]);
const modalidades = ref<any[]>([]);
const modalidadeSel = ref<number | ''>('');
const tipo = computed(() => (aba.value === 'admissao' ? 'ADMISSAO' : 'DESLIGAMENTO'));
async function carregarItens() {
  if (!['admissao', 'desligamento', 'modalidades'].includes(aba.value)) return;
  const mod = aba.value === 'modalidades' ? modalidadeSel.value : '';
  if (aba.value === 'modalidades' && !mod) { itens.value = []; return; }
  itens.value = await get(`/config/modelo-itens?tipo=${tipo.value}&modalidade_id=${mod}`);
}
const itemEd = ref<any>(null);
function novoItem() {
  itemEd.value = { tipo: tipo.value, modalidade_id: aba.value === 'modalidades' ? modalidadeSel.value : null, categoria: aba.value === 'modalidades' ? 'Documentos da rescisão' : '', descricao: '', orientacao: '', obrigatorio: true, condicional: false, prazo_dias: '', vigencia_inicio: '', vigencia_fim: '', ordem: 0, ativo: true };
}
async function salvarItem() {
  const x = itemEd.value;
  const ok = await tentar(() => (x.id ? put(`/config/modelo-itens/${x.id}`, x) : post('/config/modelo-itens', x)), 'Modelo salvo. Vale para os próximos processos.');
  if (ok) { itemEd.value = null; carregarItens(); }
}
async function excluirItem(x: any) {
  if (await confirmar('Excluir item do modelo?', `"${x.descricao}". Processos já abertos não são afetados. Prefira desativar se quiser manter o histórico.`, 'Excluir', true)
    && await tentar(() => del(`/config/modelo-itens/${x.id}`))) carregarItens();
}
const categorias = computed(() => [...new Set(itens.value.map((i) => i.categoria))]);

async function novaModalidade() {
  const nome = await pedirTexto('Nova modalidade de rescisão', 'Nome da modalidade:', 'Criar');
  if (!nome) return;
  const codigo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (await tentar(async () => { const m = await post('/config/modalidades', { codigo, nome }); modalidades.value = await get('/modalidades'); modalidadeSel.value = m.id; }, 'Modalidade criada.')) carregarItens();
}

// ---------- Modelos de prazos ----------
const modelos = ref<any[]>([]);
const modeloSel = ref<number | null>(null);
const modelo = computed(() => modelos.value.find((m) => m.id === modeloSel.value));
async function carregarModelos() {
  modelos.value = await get('/config/modelos-prazo');
  if (!modeloSel.value || !modelo.value) modeloSel.value = modelos.value[0]?.id ?? null;
}
const etapaEd = ref<any>(null);
async function salvarEtapa() {
  const e = etapaEd.value;
  if (await tentar(() => (e.id ? put(`/config/etapas/${e.id}`, e) : post(`/config/modelos-prazo/${modeloSel.value}/etapas`, e)), 'Etapa salva.')) { etapaEd.value = null; carregarModelos(); }
}
async function excluirEtapa(e: any) {
  if (await confirmar('Excluir etapa?', e.etapa, 'Excluir', true) && await tentar(() => del(`/config/etapas/${e.id}`))) carregarModelos();
}
async function duplicar() {
  const nome = await pedirTexto('Duplicar modelo (RF28)', `Nome do novo modelo (cópia de "${modelo.value.nome}"):`, 'Duplicar');
  if (nome && await tentar(async () => { const m = await post(`/config/modelos-prazo/${modeloSel.value}/duplicar`, { nome }); await carregarModelos(); modeloSel.value = m.id; }, 'Modelo duplicado.')) return;
}
async function tornarPadrao() {
  if (await tentar(() => put(`/config/modelos-prazo/${modeloSel.value}`, { nome: modelo.value.nome, padrao: true }), 'Modelo definido como padrão.')) carregarModelos();
}
async function excluirModelo() {
  if (await confirmar('Excluir modelo?', modelo.value.nome, 'Excluir', true) && await tentar(() => del(`/config/modelos-prazo/${modeloSel.value}`), 'Modelo excluído.')) { modeloSel.value = null; carregarModelos(); }
}

// ---------- Parâmetros e áreas ----------
const parametros = ref<any[]>([]);
const areas = ref<any[]>([]);
async function salvarParam(p: any) { await tentar(() => put(`/config/parametros/${p.chave}`, { valor: p.valor }), 'Parâmetro salvo.'); }
async function novaArea() {
  const nome = await pedirTexto('Nova área', 'Nome da área/setor:', 'Criar');
  if (nome && await tentar(() => post('/areas', { nome }), 'Área criada.')) areas.value = await get('/areas');
}
async function renomearArea(a: any) {
  const nome = await pedirTexto('Renomear área', `Novo nome para "${a.nome}":`, 'Salvar');
  if (nome && await tentar(() => put(`/areas/${a.id}`, { nome }), 'Área renomeada.')) areas.value = await get('/areas');
}

watch(aba, async (v) => {
  if (v === 'prazos') carregarModelos();
  else if (v === 'parametros') parametros.value = await get('/config/parametros');
  else if (v === 'areas') areas.value = await get('/areas');
  else carregarItens();
});
watch(modalidadeSel, carregarItens);
onMounted(async () => { modalidades.value = await get('/modalidades'); modalidadeSel.value = modalidades.value[0]?.id ?? ''; carregarItens(); });
</script>

<template>
  <div>
    <div class="topo"><div><h1>Configurações</h1><p>Checklists, modalidades, prazos e regras parametrizáveis sem alterar o código (RNF06). As mudanças valem para processos criados depois.</p></div></div>
    <div class="abas">
      <button :class="{ ativa: aba === 'admissao' }" @click="aba = 'admissao'">Checklist de admissão</button>
      <button :class="{ ativa: aba === 'desligamento' }" @click="aba = 'desligamento'">Checklist de desligamento</button>
      <button :class="{ ativa: aba === 'modalidades' }" @click="aba = 'modalidades'">Modalidades de rescisão</button>
      <button :class="{ ativa: aba === 'prazos' }" @click="aba = 'prazos'">Modelos de prazos</button>
      <button :class="{ ativa: aba === 'parametros' }" @click="aba = 'parametros'">Parâmetros</button>
      <button :class="{ ativa: aba === 'areas' }" @click="aba = 'areas'">Áreas</button>
    </div>

    <section v-if="['admissao', 'desligamento', 'modalidades'].includes(aba)" class="cartao">
      <div class="inline" style="justify-content:space-between;margin-bottom:10px;flex-wrap:wrap">
        <div v-if="aba === 'modalidades'" class="inline">
          <select v-model="modalidadeSel" style="min-width:320px"><option v-for="m in modalidades" :key="m.id" :value="m.id">{{ m.nome }}</option></select>
          <button @click="novaModalidade">+ Modalidade</button>
        </div>
        <div v-else class="mudo pequeno">{{ itens.length }} itens no modelo</div>
        <button class="primario" @click="novoItem">+ Item</button>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th>Ordem</th><th>Etapa</th><th>Descrição</th><th>Obrig.</th><th>Condic.</th><th>Prazo (dias)</th><th>Vigência</th><th>Ativo</th><th></th></tr></thead>
          <tbody>
            <tr v-for="x in itens" :key="x.id" :style="x.ativo ? '' : 'opacity:.5'">
              <td class="num mudo">{{ x.ordem }}</td><td>{{ x.categoria }}</td>
              <td>{{ x.descricao }}<div v-if="x.orientacao" class="mudo pequeno">{{ x.orientacao }}</div></td>
              <td>{{ x.obrigatorio ? 'Sim' : 'Não' }}</td><td>{{ x.condicional ? 'Sim' : 'Não' }}</td>
              <td class="num">{{ x.prazo_dias ?? '—' }}</td>
              <td class="pequeno">{{ x.vigencia_inicio || x.vigencia_fim ? `${x.vigencia_inicio ?? '…'} a ${x.vigencia_fim ?? '…'}` : '—' }}</td>
              <td>{{ x.ativo ? 'Sim' : 'Não' }}</td>
              <td style="white-space:nowrap"><button class="link mini" @click="itemEd = { ...x, prazo_dias: x.prazo_dias ?? '', vigencia_inicio: x.vigencia_inicio ?? '', vigencia_fim: x.vigencia_fim ?? '' }">Editar</button><button class="link mini perigo" @click="excluirItem(x)">Excluir</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="aba === 'prazos'" class="cartao">
      <div class="inline" style="justify-content:space-between;margin-bottom:10px;flex-wrap:wrap">
        <div class="inline">
          <select v-model="modeloSel" style="min-width:300px"><option v-for="m in modelos" :key="m.id" :value="m.id">{{ m.nome }}{{ m.padrao ? ' (padrão)' : '' }}</option></select>
        </div>
        <div class="acoes" v-if="modelo">
          <button v-if="!modelo.padrao" @click="tornarPadrao">Tornar padrão</button>
          <button @click="duplicar">Duplicar</button>
          <button class="perigo" @click="excluirModelo">Excluir</button>
          <button class="primario" @click="etapaEd = { etapa: '', dias: 0, responsavel: '', responsavel_final: '', ordem: 0 }">+ Etapa</button>
        </div>
      </div>
      <table v-if="modelo">
        <thead><tr><th>Ordem</th><th>Etapa</th><th>Dias em relação ao 1º dia</th><th>Responsável</th><th>Responsável final</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in modelo.etapas" :key="e.id">
            <td class="num mudo">{{ e.ordem }}</td><td>{{ e.etapa }}</td><td class="num">{{ e.dias > 0 ? '+' : '' }}{{ e.dias }}</td><td>{{ e.responsavel }}</td><td class="mudo">{{ e.responsavel_final ?? '—' }}</td>
            <td style="white-space:nowrap"><button class="link mini" @click="etapaEd = { ...e, responsavel_final: e.responsavel_final ?? '' }">Editar</button><button class="link mini perigo" @click="excluirEtapa(e)">Excluir</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="aba === 'parametros'" class="cartao">
      <div v-for="p in parametros" :key="p.chave" class="campo" style="border-bottom:1px solid var(--linha);padding-bottom:12px">
        <label>{{ p.chave }}</label>
        <div class="mudo pequeno" style="margin-bottom:6px">{{ p.descricao }}</div>
        <div class="inline">
          <textarea v-if="p.valor.length > 60" v-model="p.valor" style="min-height:140px" />
          <select v-else-if="p.valor === 'true' || p.valor === 'false'" v-model="p.valor" style="max-width:200px"><option value="true">Sim</option><option value="false">Não</option></select>
          <input v-else v-model="p.valor" style="max-width:360px" />
          <button class="primario mini" @click="salvarParam(p)">Salvar</button>
        </div>
      </div>
    </section>

    <section v-if="aba === 'areas'" class="cartao">
      <div class="inline" style="justify-content:flex-end;margin-bottom:10px"><button class="primario" @click="novaArea">+ Área</button></div>
      <table>
        <thead><tr><th>Área / setor</th><th>Pessoas</th><th></th></tr></thead>
        <tbody><tr v-for="a in areas" :key="a.id"><td>{{ a.nome }}</td><td class="num">{{ a.colaboradores }}</td><td><button class="link mini" @click="renomearArea(a)">Renomear</button></td></tr></tbody>
      </table>
    </section>

    <div v-if="itemEd" class="modal-fundo" @click.self="itemEd = null">
      <form class="modal" @submit.prevent="salvarItem">
        <h2>{{ itemEd.id ? 'Editar item do modelo' : 'Novo item do modelo' }}</h2>
        <div class="form-grade">
          <div class="campo"><label>Etapa / categoria</label><input v-model="itemEd.categoria" list="cats" required /><datalist id="cats"><option v-for="c in categorias" :key="c" :value="c" /></datalist></div>
          <div class="campo"><label>Ordem</label><input v-model.number="itemEd.ordem" type="number" /></div>
        </div>
        <div class="campo"><label>Descrição</label><input v-model="itemEd.descricao" required /></div>
        <div class="campo"><label>Orientação / exigência (RF15)</label><textarea v-model="itemEd.orientacao" /></div>
        <div class="form-grade">
          <div class="campo"><label>Prazo (dias em relação à data do processo)</label><input v-model="itemEd.prazo_dias" type="number" placeholder="Ex.: -1 ou 10" /></div>
          <div class="campo"><label>Vigência — início</label><input v-model="itemEd.vigencia_inicio" type="date" /></div>
          <div class="campo"><label>Vigência — fim</label><input v-model="itemEd.vigencia_fim" type="date" /></div>
        </div>
        <label class="inline"><input v-model="itemEd.obrigatorio" type="checkbox" /> Obrigatório para concluir o processo</label>
        <label class="inline"><input v-model="itemEd.condicional" type="checkbox" /> Condicional (permite "Não se aplica")</label>
        <label class="inline"><input v-model="itemEd.ativo" type="checkbox" /> Ativo</label>
        <footer><button type="button" @click="itemEd = null">Cancelar</button><button class="primario">Salvar</button></footer>
      </form>
    </div>
    <div v-if="etapaEd" class="modal-fundo" @click.self="etapaEd = null">
      <form class="modal" @submit.prevent="salvarEtapa">
        <h2>{{ etapaEd.id ? 'Editar etapa' : 'Nova etapa' }}</h2>
        <div class="campo"><label>Etapa</label><input v-model="etapaEd.etapa" required /></div>
        <div class="form-grade">
          <div class="campo"><label>Dias (negativo = antes do 1º dia)</label><input v-model.number="etapaEd.dias" type="number" required /></div>
          <div class="campo"><label>Ordem</label><input v-model.number="etapaEd.ordem" type="number" /></div>
          <div class="campo"><label>Responsável</label><input v-model="etapaEd.responsavel" required /></div>
          <div class="campo"><label>Responsável final</label><input v-model="etapaEd.responsavel_final" /></div>
        </div>
        <footer><button type="button" @click="etapaEd = null">Cancelar</button><button class="primario">Salvar</button></footer>
      </form>
    </div>
  </div>
</template>
