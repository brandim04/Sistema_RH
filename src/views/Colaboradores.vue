<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { exportarExcel, lerPlanilhaCadastro } from '../excel';
import { avisar, cor, data, get, moeda, pode, post, rotulo, tentar } from '../servicos';

const router = useRouter();
const lista = ref<any[]>([]);
const areas = ref<any[]>([]);
const busca = ref('');
const status = ref('');
const area = ref('');
const carregando = ref(false);

async function carregar() {
  carregando.value = true;
  const q = new URLSearchParams({ busca: busca.value, status: status.value, area_id: area.value });
  lista.value = await get(`/colaboradores?${q}`);
  carregando.value = false;
}
let t: any;
watch([busca, status, area], () => { clearTimeout(t); t = setTimeout(carregar, 250); });
onMounted(async () => { areas.value = await get('/areas'); carregar(); });

function exportar() {
  exportarExcel('colaboradores.xlsx', 'Colaboradores', [
    { titulo: 'Matrícula', campo: 'matricula', largura: 10 }, { titulo: 'Nome', campo: 'nome', largura: 32 },
    { titulo: 'CPF', campo: 'cpf', largura: 16 }, { titulo: 'Nascimento', campo: 'data_nascimento', formato: data },
    { titulo: 'Área', campo: 'area_nome' }, { titulo: 'Cargo', campo: 'cargo', largura: 24 },
    { titulo: 'Nível', campo: 'nivel', formato: (v) => rotulo('nivel', v) }, { titulo: 'Salário', campo: 'salario' },
    { titulo: 'Admissão', campo: 'data_admissao', formato: data }, { titulo: 'Demissão', campo: 'data_demissao', formato: data },
    { titulo: 'Situação', campo: 'status', formato: (v) => rotulo('status', v) },
  ], lista.value);
}

// RNF13: importação da planilha original "Cadastro de pessoas colaboradoras"
const importacao = ref<{ linhas: any[]; validar: boolean; resultado?: any } | null>(null);
async function escolherArquivo(ev: Event) {
  const arq = (ev.target as HTMLInputElement).files?.[0];
  (ev.target as HTMLInputElement).value = '';
  if (!arq) return;
  try {
    const linhas = await lerPlanilhaCadastro(arq);
    if (!linhas.length) return avisar('Nenhuma linha com "Nome" encontrada na planilha.', true);
    importacao.value = { linhas, validar: true };
  } catch (e: any) { avisar('Não foi possível ler a planilha: ' + e.message, true); }
}
async function importar() {
  if (!importacao.value) return;
  await tentar(async () => {
    importacao.value!.resultado = await post('/colaboradores/importar', { linhas: importacao.value!.linhas, validar_digitos_cpf: importacao.value!.validar });
    carregar();
  });
}
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Colaboradores</h1><p>Cadastro único usado por admissão, férias e desligamento.</p></div>
      <div class="acoes">
        <button @click="exportar">Exportar Excel</button>
        <label v-if="pode('colaborador:escrever')" class="botao" style="margin:0;font-size:14px;color:var(--tinta);font-weight:400">Importar planilha<input type="file" accept=".xlsx" hidden @change="escolherArquivo" /></label>
        <button v-if="pode('colaborador:escrever')" class="primario" @click="router.push('/colaboradores/novo')">+ Novo colaborador</button>
      </div>
    </div>
    <div class="cartao">
      <div class="filtros">
        <div class="campo" style="flex:1;min-width:220px"><label>Buscar por nome ou matrícula</label><input v-model="busca" placeholder="Digite um nome…" /></div>
        <div class="campo"><label>Situação</label><select v-model="status"><option value="">Todas</option><option v-for="(v, k) in { ATIVO: 1, EM_ADMISSAO: 1, INATIVO: 1, DESLIGADO: 1 }" :key="k" :value="k">{{ rotulo('status', k) }}</option></select></div>
        <div class="campo"><label>Área</label><select v-model="area"><option value="">Todas</option><option v-for="a in areas" :key="a.id" :value="a.id">{{ a.nome }}</option></select></div>
      </div>
      <div class="tabela-rolagem">
        <table>
          <thead><tr><th>Matr.</th><th>Nome</th><th>CPF</th><th>Área</th><th>Cargo</th><th>Nível</th><th v-if="pode('colaborador:sensivel')">Salário</th><th>Admissão</th><th>Situação</th></tr></thead>
          <tbody>
            <tr v-for="c in lista" :key="c.id" class="clicavel" @click="router.push(`/colaboradores/${c.id}`)">
              <td class="num mudo">{{ c.matricula }}</td>
              <td><strong>{{ c.nome }}</strong></td>
              <td class="num">{{ c.cpf }}</td>
              <td>{{ c.area_nome ?? '—' }}</td>
              <td>{{ c.cargo }}</td>
              <td>{{ rotulo('nivel', c.nivel) }}</td>
              <td v-if="pode('colaborador:sensivel')" class="num">{{ moeda(c.salario) }}</td>
              <td class="num">{{ data(c.data_admissao) }}</td>
              <td><span class="etiqueta" :class="cor('status', c.status)">{{ rotulo('status', c.status) }}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!lista.length && !carregando" class="vazio">Nenhuma pessoa encontrada.</div>
      </div>
    </div>

    <div v-if="importacao" class="modal-fundo" @click.self="importacao = null">
      <div class="modal largo">
        <h2>Importar planilha de cadastro</h2>
        <template v-if="!importacao.resultado">
          <p>{{ importacao.linhas.length }} pessoa(s) encontradas, juntando as abas de dados pessoais e profissionais pelo nome.</p>
          <div class="tabela-rolagem" style="max-height:300px;overflow-y:auto">
            <table>
              <thead><tr><th>Linha</th><th>Nome</th><th>CPF</th><th>Admissão</th><th>Área</th><th>Cargo</th><th>Nível</th></tr></thead>
              <tbody><tr v-for="l in importacao.linhas" :key="l.nome"><td>{{ l.__linha }}</td><td>{{ l.nome }}</td><td>{{ l.cpf }}</td><td>{{ data(l.data_admissao) }}</td><td>{{ l.area }}</td><td>{{ l.cargo }}</td><td>{{ rotulo('nivel', l.nivel) }}</td></tr></tbody>
            </table>
          </div>
          <label class="inline" style="margin-top:12px"><input v-model="importacao.validar" type="checkbox" /> Validar dígitos verificadores do CPF (desmarque apenas para os dados fictícios da planilha-modelo)</label>
          <footer><button @click="importacao = null">Cancelar</button><button class="primario" @click="importar">Importar</button></footer>
        </template>
        <template v-else>
          <div class="aviso verde">{{ importacao.resultado.importados }} pessoa(s) importada(s).</div>
          <div v-if="importacao.resultado.erros.length" class="aviso vermelho">
            {{ importacao.resultado.erros.length }} linha(s) com erro:
            <ul><li v-for="e in importacao.resultado.erros" :key="e.linha">Linha {{ e.linha }} ({{ e.nome }}): {{ e.erro }}</li></ul>
          </div>
          <footer><button class="primario" @click="importacao = null">Fechar</button></footer>
        </template>
      </div>
    </div>
  </div>
</template>
