<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dialogo, pode, post, rotulo, sessao, toasts } from './servicos';

const route = useRoute();
const router = useRouter();
const menuAberto = ref(false);
const logado = computed(() => !!sessao.usuario && route.path !== '/login' && !route.path.endsWith('/lgpd'));
watch(() => route.fullPath, () => { menuAberto.value = false; });

async function sair() {
  await post('/auth/logout');
  sessao.usuario = null;
  router.push('/login');
}

const campoDialogo = ref<HTMLInputElement | null>(null);
watch(() => dialogo.aberto, async (v) => { if (v) { await nextTick(); campoDialogo.value?.focus(); } });
function fecharDialogo(ok: boolean) {
  if (ok && dialogo.pedirTexto && !dialogo.valor.trim()) return;
  dialogo.aberto = false;
  dialogo.resolver?.(ok ? (dialogo.pedirTexto ? dialogo.valor.trim() : 'ok') : null);
}
</script>

<template>
  <div v-if="logado" class="app">
    <aside class="lateral" :class="{ aberta: menuAberto }">
      <div class="marca">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#1f6f5c" /><circle cx="16" cy="16" r="8" fill="none" stroke="white" stroke-width="3" stroke-dasharray="38 12" /></svg>
        <div>Ciclo de Vida<small>do Colaborador</small></div>
      </div>
      <nav>
        <router-link v-if="pode('processo:ler')" to="/" exact-active-class="router-link-active">Painel</router-link>
        <div class="grupo">Pessoas</div>
        <router-link v-if="pode('colaborador:ler')" to="/colaboradores">Colaboradores</router-link>
        <router-link v-if="pode('colaborador:ler')" to="/quadro">Quadro de pessoal</router-link>
        <div class="grupo">Processos</div>
        <router-link v-if="pode('processo:ler')" to="/admissoes">Admissões</router-link>
        <router-link v-if="pode('processo:ler')" to="/tarefas">Prazos e tarefas</router-link>
        <router-link v-if="pode('processo:ler')" to="/desligamentos">Desligamentos</router-link>
        <div class="grupo">Férias</div>
        <router-link v-if="pode('ferias:ler')" to="/ferias" :class="{ 'router-link-active': route.path.startsWith('/ferias') && route.path !== '/ferias/mapa' }">Controle de férias</router-link>
        <router-link v-if="pode('ferias:ler')" to="/ferias/mapa">Mapa de férias</router-link>
        <div class="grupo">Administração</div>
        <router-link v-if="pode('processo:ler')" to="/fgts-digital">Guia FGTS Digital</router-link>
        <router-link v-if="pode('config:escrever')" to="/configuracoes">Configurações</router-link>
        <router-link v-if="pode('usuario:admin')" to="/usuarios">Usuários e perfis</router-link>
        <router-link v-if="pode('auditoria:ler')" to="/auditoria">Auditoria</router-link>
      </nav>
      <div class="usuario-box">
        <div style="color:#fff">{{ sessao.usuario?.nome }}</div>
        <div>{{ rotulo('perfil', sessao.usuario?.perfil) }}</div>
        <div class="inline" style="margin-top:6px">
          <router-link to="/minha-senha" style="color:#9cbdb4;font-size:12px">Alterar senha</router-link>
          <button class="mini" @click="sair">Sair</button>
        </div>
      </div>
    </aside>
    <main class="conteudo">
      <button class="menu-movel" @click="menuAberto = !menuAberto" aria-label="Abrir menu">☰ Menu</button>
      <router-view />
    </main>
  </div>
  <router-view v-else />

  <div v-if="dialogo.aberto" class="modal-fundo" @click.self="fecharDialogo(false)">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>{{ dialogo.titulo }}</h2>
      <p v-if="dialogo.texto" style="white-space:pre-line">{{ dialogo.texto }}</p>
      <textarea v-if="dialogo.pedirTexto" ref="campoDialogo" v-model="dialogo.valor" placeholder="Descreva o motivo" />
      <footer>
        <button @click="fecharDialogo(false)">Voltar</button>
        <button :class="dialogo.perigo ? 'perigo cheio' : 'primario'" :disabled="dialogo.pedirTexto && !dialogo.valor.trim()" @click="fecharDialogo(true)">{{ dialogo.confirmar }}</button>
      </footer>
    </div>
  </div>

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="{ erro: t.erro }">
      {{ t.texto }}
      <ul v-if="t.lista?.length"><li v-for="(l, i) in t.lista" :key="i">{{ l }}</li></ul>
    </div>
  </div>
</template>
