<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError, avisar, get, post, put, ROTULOS } from '../servicos';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id as string | undefined);
const areas = ref<any[]>([]);
const erros = ref<Record<string, string>>({});
const salvando = ref(false);
const f = ref<any>({
  nome: '', rg: '', cpf: '', data_nascimento: '', nacionalidade: 'Brasileira', estado: '', cidade: '', estado_civil: '',
  titulo_eleitor: '', reservista: '', ctps: '', pis_pasep: '', data_admissao: '', area_id: '', cargo: '', nivel: '', salario: '',
  status: 'ATIVO',
});
const novaArea = ref('');

onMounted(async () => {
  areas.value = await get('/areas');
  if (id.value) {
    const c = await get(`/colaboradores/${id.value}`);
    for (const k of Object.keys(f.value)) f.value[k] = c[k] ?? '';
  }
});

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function mascaraCpf() {
  const d = f.value.cpf.replace(/\D/g, '').slice(0, 11);
  f.value.cpf = d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

async function criarArea() {
  if (!novaArea.value.trim()) return;
  try {
    const a = await post('/areas', { nome: novaArea.value });
    areas.value.push(a);
    f.value.area_id = a.id;
    novaArea.value = '';
  } catch (e: any) { avisar(e.message, true); }
}

async function salvar() {
  erros.value = {};
  salvando.value = true;
  try {
    const corpo = { ...f.value };
    const c = id.value ? await put(`/colaboradores/${id.value}`, corpo) : await post('/colaboradores', corpo);
    avisar('Cadastro salvo.');
    router.push(`/colaboradores/${c.id}`);
  } catch (e: any) {
    if (e instanceof ApiError && e.campos) for (const c of e.campos) erros.value[c.campo] = c.mensagem;
    avisar(e.message, true);
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="salvar">
    <div class="topo">
      <div><h1>{{ id ? 'Editar colaborador' : 'Novo colaborador' }}</h1><p>Campos com * são obrigatórios.</p></div>
      <div class="acoes"><button type="button" @click="router.back()">Cancelar</button><button class="primario" :disabled="salvando">Salvar</button></div>
    </div>

    <section class="cartao">
      <h2>Dados pessoais</h2>
      <div class="form-grade">
        <div class="campo" style="grid-column: span 2"><label>Nome completo *</label><input v-model="f.nome" required maxlength="160" /><div class="erro">{{ erros.nome }}</div></div>
        <div class="campo"><label>CPF *</label><input v-model="f.cpf" required inputmode="numeric" placeholder="000.000.000-00" @input="mascaraCpf" /><div class="erro">{{ erros.cpf }}</div></div>
        <div class="campo"><label>RG</label><input v-model="f.rg" maxlength="30" /></div>
        <div class="campo"><label>Data de nascimento</label><input v-model="f.data_nascimento" type="date" /></div>
        <div class="campo"><label>Nacionalidade</label><input v-model="f.nacionalidade" maxlength="60" /></div>
        <div class="campo"><label>Estado (UF)</label><select v-model="f.estado"><option value="" /><option v-for="u in UFS" :key="u">{{ u }}</option></select></div>
        <div class="campo"><label>Cidade</label><input v-model="f.cidade" maxlength="80" /></div>
        <div class="campo"><label>Estado civil</label><select v-model="f.estado_civil"><option value="" /><option v-for="(v, k) in ROTULOS.estado_civil" :key="k" :value="k">{{ v }}</option></select></div>
        <div class="campo"><label>Título eleitoral</label><input v-model="f.titulo_eleitor" maxlength="30" /></div>
        <div class="campo"><label>Nº reservista <span class="mudo">(opcional)</span></label><input v-model="f.reservista" maxlength="30" /></div>
      </div>
    </section>

    <section class="cartao">
      <h2>Dados profissionais</h2>
      <div class="form-grade">
        <div class="campo"><label>CTPS</label><input v-model="f.ctps" maxlength="30" /></div>
        <div class="campo"><label>PIS/PASEP</label><input v-model="f.pis_pasep" maxlength="30" /></div>
        <div class="campo"><label>Data de admissão *</label><input v-model="f.data_admissao" type="date" required /><div class="erro">{{ erros.data_admissao }}</div></div>
        <div class="campo">
          <label>Área</label>
          <select v-model="f.area_id"><option value="">—</option><option v-for="a in areas" :key="a.id" :value="a.id">{{ a.nome }}</option></select>
          <div class="inline" style="margin-top:4px"><input v-model="novaArea" placeholder="Nova área" style="padding:4px 8px" @keydown.enter.prevent="criarArea" /><button type="button" class="mini" @click="criarArea">+</button></div>
        </div>
        <div class="campo"><label>Cargo *</label><input v-model="f.cargo" required maxlength="100" /><div class="erro">{{ erros.cargo }}</div></div>
        <div class="campo"><label>Nível</label><select v-model="f.nivel"><option value="">—</option><option v-for="(v, k) in { JUNIOR: 1, PLENO: 1, SENIOR: 1 }" :key="k" :value="k">{{ ROTULOS.nivel[k] }}</option></select></div>
        <div class="campo"><label>Salário (R$)</label><input v-model="f.salario" type="number" min="0" step="0.01" /></div>
        <div v-if="!id" class="campo"><label>Situação inicial</label><select v-model="f.status"><option value="ATIVO">Ativo (já trabalha na empresa)</option><option value="EM_ADMISSAO">Em admissão (vai iniciar)</option></select></div>
      </div>
      <p class="mudo pequeno">A data de demissão é preenchida automaticamente quando o processo de desligamento é concluído (RN03).</p>
    </section>
  </form>
</template>
