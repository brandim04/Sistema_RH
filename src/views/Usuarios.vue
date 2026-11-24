<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { baixar } from '../excel';
import { dataHora, get, post, put, rotulo, ROTULOS, tentar } from '../servicos';

const lista = ref<any[]>([]);
const ed = ref<any>(null);
async function carregar() { lista.value = await get('/usuarios'); }
onMounted(carregar);
async function salvar() {
  const u = ed.value;
  if (await tentar(() => (u.id ? put(`/usuarios/${u.id}`, u) : post('/usuarios', u)), 'Usuário salvo.')) { ed.value = null; carregar(); }
}
async function backup() {
  await tentar(async () => {
    const r = await fetch('/api/admin/backup', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Falha ao gerar a cópia de segurança.');
    baixar(await r.blob(), `backup-ciclo-vida-${new Date().toISOString().slice(0, 10)}.json`);
  }, 'Cópia de segurança gerada.');
}
const PERMS: Record<string, string> = {
  ADMIN: 'Tudo, inclusive usuários, auditoria e cópia de segurança.',
  RH: 'Cadastro, processos, férias, configurações e auditoria.',
  DP: 'Cadastro, processos e férias (sem configurações).',
  GESTOR: 'Consulta de colaboradores (sem dados sensíveis), pendências e mapa de férias.',
  TI: 'Consulta de processos, marcação de itens do checklist e equipamentos.',
};
</script>

<template>
  <div>
    <div class="topo">
      <div><h1>Usuários e perfis</h1><p>Controle de acesso por perfil.</p></div>
      <div class="acoes"><button @click="backup">Baixar cópia de segurança</button><button class="primario" @click="ed = { nome: '', email: '', perfil: 'RH', ativo: true, senha: '' }">+ Usuário</button></div>
    </div>
    <div class="cartao">
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in lista" :key="u.id">
            <td>{{ u.nome }}</td><td>{{ u.email }}</td><td>{{ rotulo('perfil', u.perfil) }}</td>
            <td><span class="etiqueta" :class="u.ativo ? 'verde' : ''">{{ u.ativo ? 'Ativo' : 'Bloqueado' }}</span></td>
            <td class="pequeno mudo">{{ dataHora(u.criado_em) }}</td>
            <td><button class="link mini" @click="ed = { ...u, senha: '' }">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <section class="cartao">
      <h2>O que cada perfil pode fazer</h2>
      <table><tbody><tr v-for="(v, k) in PERMS" :key="k"><td style="width:200px"><strong>{{ rotulo('perfil', k) }}</strong></td><td>{{ v }}</td></tr></tbody></table>
    </section>
    <div v-if="ed" class="modal-fundo" @click.self="ed = null">
      <form class="modal" @submit.prevent="salvar">
        <h2>{{ ed.id ? 'Editar usuário' : 'Novo usuário' }}</h2>
        <div class="campo"><label>Nome</label><input v-model="ed.nome" required /></div>
        <div class="campo"><label>E-mail</label><input v-model="ed.email" type="email" required /></div>
        <div class="campo"><label>Perfil</label><select v-model="ed.perfil"><option v-for="(v, k) in ROTULOS.perfil" :key="k" :value="k">{{ v }}</option></select><div class="mudo pequeno" style="margin-top:4px">{{ PERMS[ed.perfil] }}</div></div>
        <div class="campo"><label>{{ ed.id ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial' }}</label><input v-model="ed.senha" type="password" minlength="8" :required="!ed.id" autocomplete="new-password" /></div>
        <label class="inline"><input v-model="ed.ativo" type="checkbox" /> Acesso ativo</label>
        <footer><button type="button" @click="ed = null">Cancelar</button><button class="primario">Salvar</button></footer>
      </form>
    </div>
  </div>
</template>
