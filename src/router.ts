import { createRouter, createWebHistory } from 'vue-router';
import { definirAoExpirar, get, pode, sessao } from './servicos';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue'), meta: { publica: true } },
    { path: '/', component: () => import('./views/Painel.vue'), meta: { perm: 'processo:ler' } },
    { path: '/colaboradores', component: () => import('./views/Colaboradores.vue'), meta: { perm: 'colaborador:ler' } },
    { path: '/colaboradores/novo', component: () => import('./views/ColaboradorForm.vue'), meta: { perm: 'colaborador:escrever' } },
    { path: '/colaboradores/:id/editar', component: () => import('./views/ColaboradorForm.vue'), meta: { perm: 'colaborador:escrever' } },
    { path: '/colaboradores/:id', component: () => import('./views/ColaboradorDetalhe.vue'), meta: { perm: 'colaborador:ler' } },
    { path: '/quadro', component: () => import('./views/Quadro.vue'), meta: { perm: 'colaborador:ler' } },
    { path: '/admissoes', component: () => import('./views/Admissoes.vue'), meta: { perm: 'processo:ler' } },
    { path: '/admissoes/:id', component: () => import('./views/AdmissaoDetalhe.vue'), meta: { perm: 'processo:ler' } },
    { path: '/admissoes/:id/lgpd', component: () => import('./views/TermoLgpd.vue'), meta: { perm: 'colaborador:sensivel' } },
    { path: '/tarefas', component: () => import('./views/Tarefas.vue'), meta: { perm: 'processo:ler' } },
    { path: '/ferias', component: () => import('./views/Ferias.vue'), meta: { perm: 'ferias:ler' } },
    { path: '/ferias/mapa', component: () => import('./views/MapaFerias.vue'), meta: { perm: 'ferias:ler' } },
    { path: '/ferias/:id', component: () => import('./views/FeriasColaborador.vue'), meta: { perm: 'ferias:ler' } },
    { path: '/desligamentos', component: () => import('./views/Desligamentos.vue'), meta: { perm: 'processo:ler' } },
    { path: '/desligamentos/:id', component: () => import('./views/DesligamentoDetalhe.vue'), meta: { perm: 'processo:ler' } },
    { path: '/fgts-digital', component: () => import('./views/FgtsDigital.vue'), meta: { perm: 'processo:ler' } },
    { path: '/configuracoes', component: () => import('./views/Configuracoes.vue'), meta: { perm: 'config:escrever' } },
    { path: '/usuarios', component: () => import('./views/Usuarios.vue'), meta: { perm: 'usuario:admin' } },
    { path: '/auditoria', component: () => import('./views/Auditoria.vue'), meta: { perm: 'auditoria:ler' } },
    { path: '/minha-senha', component: () => import('./views/MinhaSenha.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (!sessao.carregado) {
    try { sessao.usuario = await get('/auth/me'); } catch { sessao.usuario = null; }
    sessao.carregado = true;
  }
  if (to.meta.publica) return sessao.usuario ? '/' : true;
  if (!sessao.usuario) return { path: '/login', query: { volta: to.fullPath } };
  const perm = to.meta.perm as string | undefined;
  if (perm && !pode(perm)) {
    // Perfis sem acesso ao painel (ex.: nenhum) vão para a primeira tela permitida
    return to.path === '/' ? (pode('colaborador:ler') ? '/colaboradores' : '/minha-senha') : '/';
  }
  return true;
});

definirAoExpirar(() => {
  if (router.currentRoute.value.path !== '/login') router.push({ path: '/login', query: { volta: router.currentRoute.value.fullPath } });
});
