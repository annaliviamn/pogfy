import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Variáveis Globais
const clientId = 'ecc7df9a04c14418b8deba08f82a9909';
const redirectUri = window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5500/index.html'
    : 'https://annaliviamn.github.io/pogfy/';
const scope = 'playlist-modify-public playlist-modify-private user-read-email';
const CHAVE_ACCESS_TOKEN = 'pogfy_access_token';
const CHAVE_REFRESH_TOKEN = 'pogfy_refresh_token';
const CHAVE_CODE_VERIFIER = 'pogfy_code_verifier';
const CHAVE_PLAYLIST_ID = 'pogfy_playlist_id';


// Gera um texto aleatório que vai ser usado como "code verifier" no login do Spotify
function generateCodeVerifier(length) {

  // caracteres permitidos pelo Spotify para o code verifier: letras, números e -._~
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  // aqui vamos "grudando" um caractere por vez até formar o texto final
  let result = '';

  // cria um "array" vazio com espaço para 'length' números aleatórios (de 0 a 255 cada)
  const randomValues = new Uint8Array(length);

  // preenche esse array com números realmente aleatórios (mais seguro que Math.random)
  crypto.getRandomValues(randomValues);

    // percorre cada número aleatório gerado, um por um
  for (let i = 0; i < length; i++) {
    // usa o resto da divisão (%) pra transformar o número (0-255) numa posição válida da tabela (0-65)
    const indice = randomValues[i] % chars.length;

    // pega o caractere naquela posição da tabela e gruda no resultado final
    result += chars[indice];
  }

  return result;
}

// Calcula o "code challenge" a partir do code verifier, usando hash SHA-256
async function generateCodeChallenge(CodeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(CodeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashString = hashArray.map(byte => String.fromCharCode(byte)).join('');
    const base64 = btoa(hashString);
    const base64UrlSafe = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
    return base64UrlSafe;
}

// Inicia o processo de Login: gera os códigos PKCE e redireciona pro Spotify
async function redirectToSpotifyAuthorize() {
    const CodeVerifier = generateCodeVerifier(64);

    localStorage.setItem(CHAVE_CODE_VERIFIER, CodeVerifier);
    
    const codeChallenge = await generateCodeChallenge(CodeVerifier);

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Pega o botão de login pelo id, e chama a função de redirecionamento quando for clicado
document.getElementById('loginButton').addEventListener('click', redirectToSpotifyAuthorize);
// Chamada para função do botão de buscar quando for clicado
document.getElementById('botaoBuscar').addEventListener('click', buscarMusica);

// Abrir e fechar modal de Chat e Ranking
document.getElementById('abrirChat').addEventListener('click', () => {
    document.getElementById('modalChat').classList.remove('oculto');
});

document.getElementById('fecharChat').addEventListener('click', () => {
    document.getElementById('modalChat').classList.add('oculto');
});

document.getElementById('abrirRanking').addEventListener('click', () => {
    document.getElementById('modalRanking').classList.remove('oculto');
});

document.getElementById('fecharRanking').addEventListener('click', () => {
    document.getElementById('modalRanking').classList.add('oculto');
});

handleRedirect();
atualizarTelaLogin();

// Se já tiver token salvo, busca o perfil do usuário ao carregar
if (localStorage.getItem(CHAVE_ACCESS_TOKEN)) {
    await buscarPerfilUsuario();
    await garantirPlaylist();
    await carregarPlaylist();
    escutarMensagens();
    escutarReacoesMusicas();
    limparMensagensAntigas();
}

// Verifica se a URL atual tem um código de autorização do Spotify
async function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // Se não tiver código na URL, não faz nada
    if (!code) {
        return;
    }

    const codeVerifier = localStorage.getItem(CHAVE_CODE_VERIFIER);

    // Monta os dados que o Spotify espera para trocar o código pelo token de acesso
    const bodyParams = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });

    // Faz a chama para o Spotify trocando o código pelo token de acesso
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams
    });

    const data = await response.json();

    if (!data.access_token) {
        console.error('Erro ao obter token:', data);
        return;
    }
    
    // Guardar o access_token e o refresh_token no localStorage
    localStorage.setItem(CHAVE_ACCESS_TOKEN, data.access_token);
    localStorage.setItem(CHAVE_REFRESH_TOKEN, data.refresh_token);

    atualizarTelaLogin();
    buscarPerfilUsuario();

    // Remove o ?code=... da URL depois de usá-lo, sem recarregar a página
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Verifica se o usuário está logado
function atualizarTelaLogin() {
    const token = localStorage.getItem(CHAVE_ACCESS_TOKEN);
    const telaLogin = document.getElementById('telaLogin');
    const appLogado = document.getElementById('appLogado');

    if (token) {
        telaLogin.classList.add('oculto');
        appLogado.classList.remove('oculto');
    } else {
        telaLogin.classList.remove('oculto');
        appLogado.classList.add('oculto');
    }
}

// Sincroniza foto e nome do perfil do Spotify para o Pogfy
async function buscarPerfilUsuario() {
    const response = await fetchSpotify('https://api.spotify.com/v1/me');

    const data = await response.json();

    document.getElementById('nomeUsuario').textContent = data.display_name;

    if (data.images && data.images.length > 0) {
        document.getElementById('fotoUsuario').src = data.images[0].url;
    }
}

// Buscar músicas através da API do Spotify com base no texto digitado
async function buscarMusica(){
    const termo = document.getElementById('inputBusca').value;
    const token = localStorage.getItem(CHAVE_ACCESS_TOKEN);
    
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(termo)}&type=track&limit=5`);

    const data = await response.json();
    const musicas = data.tracks.items;

    const listaResultados = document.getElementById('resultadosBusca');
    listaResultados.innerHTML = '';

    musicas.forEach(musica => {
        const item = document.createElement('li');
        item.classList.add('resultadoMusica');

        const capa = musica.album.images[0] ? musica.album.images[0].url : '';

        item.innerHTML = `
        <img src="${capa}" alt="Capa do álbum" class="capaResultado">
        <div class="infoResultado">
            <span class="nomeResultado">${musica.name}</span>
            <span class="artistaResultado">${musica.artists[0].name}</span>
        </div>
        <button class="botaoAdicionar">Adicionar</button>
        `;

        const botao = item.querySelector('.botaoAdicionar');
        botao.addEventListener('click', () => adicionarMusica(musica.uri));

        listaResultados.appendChild(item);
    });
}

// Cria a playlist colaborativa do PogFy
async function criarPlaylist() {
    const response = await fetchSpotify('https://api.spotify.com/v1/me/playlists', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'PogFy',
            discription: 'Playlist colaborativa do grupo, feita no PogFy',
            public: false,
            collaborative: true
        })
    });

    const data = await response.json();

    localStorage.setItem(CHAVE_PLAYLIST_ID, data.id);

    console.log(data);
}

// Garante que existe uma playlist do PogFy
async function garantirPlaylist() {
    let playlistId = localStorage.getItem(CHAVE_PLAYLIST_ID);

    if (!playlistId) {
        await criarPlaylist();
        playlistId = localStorage.getItem(CHAVE_PLAYLIST_ID);
    }

    console.log('ID da playlist em uso:', playlistId);
}

// Busca os dados da playlist (nome, faixas) e atualiza a tela
async function carregarPlaylist() {
    const playlistId = localStorage.getItem(CHAVE_PLAYLIST_ID);

    const response = await fetchSpotify(`https://api.spotify.com/v1/playlists/${playlistId}`);

    const data = await response.json();

    // Atualiza o nome da playlist na tela
    document.getElementById('nomePlaylist').textContent = data.name;

    const listaPlaylist = document.getElementById('listaPlaylist');
    listaPlaylist.innerHTML = '';

    data.items.items.forEach(itemPlaylist => {
        console.log(itemPlaylist.added_by);
        const musica = itemPlaylist.item;
        const adicionadoPor = itemPlaylist.added_by.id;
        const capa = musica.album.images[0] ? musica.album.images[0].url: '';

        const item = document.createElement('li');
        item.classList.add('itemMusica');

        item.innerHTML = `
            <img src="${capa}" alt="Capa de álbum" class="capaMusica">
            <div class="infoMusica">
                <a href="${musica.external_urls.spotify}" target="_blank" class="nomeMusica">${musica.name}</a>
                <span class="nomeArtista">${musica.artists[0].name}</span>
                <span class="adicionadoPor">Adicionado por ${adicionadoPor}</span>
                <div class="reacoesMusica">
                    <button class="botaoReacaoMusica" data-id="${musica.id}" data-tipo="pog">
                        <img src="assets/pog.png" alt="Pog" class="iconeReacao">
                        <span id="pog-${musica.id}">0</span>
                    </button>
                    <button class="botaoReacaoMusica" data-id="${musica.id}" data-tipo="nog">
                        <img src="assets/nog.png" alt="Nog" class="iconeReacao">
                        <span id="nog-${musica.id}">0</span>
                    </button>
                </div>
            </div>
        `;

        listaPlaylist.appendChild(item);

    });

    // Clique dos botões de reação em música
    document.querySelectorAll('.botaoReacaoMusica').forEach(botao => {
        botao.addEventListener('click', () => reagirMusica(botao.dataset.id, botao.dataset.tipo));
    });

    montarRanking(data.items.items);
}

// Reagindo as músicas
async function reagirMusica(trackId, tipo) {
    const usuario = document.getElementById('nomeUsuario').textContent;

    await setDoc(doc(db, 'reacoesMusicas', trackId), {
        reacoes: { [usuario]: tipo }
    }, { merge: true });
}

// Fazer a função de reação funcionar nas músicas
function escutarReacoesMusicas() {
    onSnapshot(collection(db, 'reacoesMusicas'), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const dados = docSnap.data();
            const trackId = docSnap.id;

            const totalPog = contarReacoes(dados.reacoes, 'pog');
            const totalNog = contarReacoes(dados.reacoes, 'nog');

            const spanPog = document.getElementById(`pog-${trackId}`);
            const spanNog = document.getElementById(`nog-${trackId}`);

            console.log('Track ID:', trackId, '| Span POG encontrado?', spanPog);

            if (spanPog) spanPog.textContent = totalPog;
            if (spanNog) spanNog.textContent = totalNog;
        });
    });
}

// Pede um novo access_token usando o refresh_token
async function atualizarToken() {
    const refreshToken = localStorage.getItem(CHAVE_REFRESH_TOKEN);

    const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams
    });

    const data = await response.json();

    if (!data.access_token) {
        console.error('Erro ao atualizar token:', data);
        // Limpa os tokens inválidos, fazendo o app pedir novamente o login
        localStorage.removeItem(CHAVE_ACCESS_TOKEN);
        localStorage.removeItem(CHAVE_REFRESH_TOKEN);
        return;
    }

    localStorage.setItem(CHAVE_ACCESS_TOKEN, data.access_token);

    // O Spotify às vezes manda um refresh_token novo também
    if (data.refresh_token) {
        localStorage.setItem(CHAVE_REFRESH_TOKEN, data.refresh_token);
    }
}

// Faz uma chamada autenticada à API do Spofity
async function fetchSpotify(url, opcoes = {}) {
    let token = localStorage.getItem(CHAVE_ACCESS_TOKEN);

    opcoes.headers = {
        ...opcoes.headers,
        'Authorization': `Bearer ${token}`
    };

    let response = await fetch(url, opcoes);

    // Se o token expirou, renova e tenta de novo, uma única vez
    if (response.status === 401) {
        await atualizarToken();
        token = localStorage.getItem(CHAVE_ACCESS_TOKEN);

        if (!token) {
            atualizarTelaLogin();
            throw new Error('Sessão expirada, faça login novamente.')
        }

        opcoes.headers['Authorization'] = `Bearer ${token}`;
        response = await fetch(url, opcoes);
    }

    return response;
}

// Adiciona uma música na playlist do PogFy, usando o URI da faixa
async function adicionarMusica(uri) {
    const token = localStorage.getItem(CHAVE_ACCESS_TOKEN);
    const playlistId = localStorage.getItem(CHAVE_PLAYLIST_ID);

    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris:[uri]
        })
    });

    const data = await response.json();
    console.log('Música adicionada:', data);
}

// Conta quantas músicas cada pessoa adicionou, e mostra o ranking na tela
function montarRanking(items) {
    const contagem = {};

    items.forEach(itemPlaylist => {
        const usuario = itemPlaylist.added_by.id;

        if (!contagem[usuario]) {
            contagem[usuario] = 0;
        }

        contagem[usuario]++;
    });

    const listaContribuidores = document.getElementById('listaContribuidores');
    listaContribuidores.innerHTML = '';

    let posicao = 1;
    for (const usuario in contagem) {
        const item = document.createElement('li');
        item.classList.add('itemRanking');

        let medalha = '';
        if (posicao === 1) medalha = '🥇 ';
        else if (posicao === 2) medalha = '🥈 ';
        else if (posicao === 3) medalha = '🥉 ';

        item.innerHTML = `
            <span class="nomeContribuidor">${medalha}${usuario}</span>
            <span class="quantidadeContribuidor">${contagem[usuario]} música(s)</span>
        `;
        listaContribuidores.appendChild(item);
        posicao++;
    }
}

// Enviar uma nova mensagem no chat e salvando ela no Firestore (DB)
async function enviarMensagem() {
    const input = document.getElementById('inputMensagem');
    const texto = input.value.trim();

    // Se estiver vazio, não envia mensagem
    if (!texto) {
        return;
    }

    await addDoc(collection(db, 'mensagens'), {
        texto: texto,
        autor: document.getElementById('nomeUsuario').textContent,
        fotoAutor: document.getElementById('fotoUsuario').src,
        timestamp: serverTimestamp()
    });

    input.value = '';
}

document.getElementById('botaoEnviarMensagem').addEventListener('click', enviarMensagem);

// Escuta as mensagens do Firestore, atualiza a tela sempre que houver alguma edição
function escutarMensagens() {
    const mensagensRef = collection(db, 'mensagens');
    const consultaOrdenada = query(mensagensRef, orderBy('timestamp'));

    onSnapshot(consultaOrdenada, (snapshot) => {
        const containerMensagens = document.getElementById('mensagensChat');
        containerMensagens.innerHTML = '';

        const nomeUsuarioLogado = document.getElementById('nomeUsuario').textContent;

        snapshot.forEach((doc) => {
            const mensagem = doc.data();
            const ehMinhaMensagem = mensagem.autor === nomeUsuarioLogado;

            const divMensagem = document.createElement('div');
            divMensagem.classList.add('mensagem');
            divMensagem.setAttribute('data-id', doc.id);

                  const botoesAcao = ehMinhaMensagem
                    ? `<button class="botaoEditarMensagem" data-id="${doc.id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    </button>
                    <button class="botaoExcluirMensagem" data-id="${doc.id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/>
                        </svg>
                    </button>`
                    : '';

                                divMensagem.innerHTML = `
                                    <img src="${mensagem.fotoAutor || ''}" alt="Foto" class="fotoMensagem">
                                    <div class="conteudoMensagem">
                                        <span class="autorMensagem">${mensagem.autor}</span>
                                        <p class="textoMensagem" id="texto-${doc.id}">${mensagem.texto}</p>
                                        <div class="reacoesMensagem">
                                            <button class="botaoReacao" data-id="${doc.id}" data-tipo="pog">
                                                <img src="assets/pog.png" alt="Pog" class="iconeReacao">
                                                ${contarReacoes(mensagem.reacoes, 'pog')}
                                            </button>
                                            <button class="botaoReacao" data-id="${doc.id}" data-tipo="nog">
                                                <img src="assets/nog.png" alt="Nog" class="iconeReacao">
                                                ${contarReacoes(mensagem.reacoes, 'nog')}
                                            </button>
                                        </div>
                                    </div>
                                    ${botoesAcao}
                                `;

            containerMensagens.appendChild(divMensagem);
        });

        // Clique para excluir recém-criado
        document.querySelectorAll('.botaoExcluirMensagem').forEach(botao => {
            botao.addEventListener('click', () => excluirMensagem(botao.dataset.id));
        });

        // Clique para edição mensagem
        document.querySelectorAll('.botaoEditarMensagem').forEach(botao => {
            botao.addEventListener('click', () => iniciarEdicao(botao.dataset.id));
        });

        // Clique para reações
        document.querySelectorAll('.botaoReacao').forEach(botao => {
            botao.addEventListener('click', () => reagirMensagem(botao.dataset.id, botao.dataset.tipo));
        });

        containerMensagens.scrollTop = containerMensagens.scrollHeight;
    });
}

// Reações mensagens e músicas
function contarReacoes(reacoes, tipo) {
    if (!reacoes) return 0;
    return Object.values(reacoes).filter(r => r === tipo).length;
}

async function reagirMensagem(idMensagem, tipo) {
    const usuario = document.getElementById('nomeUsuario').textContent;
    const campo = `reacoes.${usuario}`;

    await updateDoc(doc(db, 'mensagens', idMensagem), {
        [campo]: tipo
    });
}

// Excluir mensagem do chat
async function excluirMensagem(id) {
    await deleteDoc(doc(db, 'mensagens', id));
}

// Editar textos das mensagens
function iniciarEdicao (idMensagem) {
    const spanTexto = document.getElementById(`texto-${idMensagem}`);
    const textoAtual = spanTexto.textContent;

    spanTexto.innerHTML = `
        <input type="text" id="inputEdicao-${idMensagem}" value="${textoAtual}" class="inputEdicaoMensagem">
        <button onclick="salvarEdicao('${idMensagem}')" class="botaoSalvarEdicao">Salvar</button>
    `;

    const input = document.getElementById(`inputEdicao-${idMensagem}`);
    input.focus();
    input.select();
}

// Salva o novo texto (editado) diretamente no Firestore
async function salvarEdicao(idMensagem) {
    const input = document.getElementById(`inputEdicao-${idMensagem}`);
    const novoTexto = input.value.trim();

    if (!novoTexto) {
        return;
    }

    await updateDoc(doc(db, 'mensagens', idMensagem), {
        texto: novoTexto
    });
}

window.salvarEdicao = salvarEdicao;

// Apaga as mensagens depois de 48 horas
async function limparMensagensAntigas() {
    const mensagensRef = collection(db, 'mensagens');
    const snapshot = await getDocs(mensagensRef);

    const agora = Date.now();
    const limiteEmMs = 48 * 60 * 60 * 1000;

    snapshot.forEach(async (docSnap) => {
        const mensagem = docSnap.data();

        if (!mensagem.timestamp) return;

        const dataMensagem = mensagem.timestamp.toDate().getTime();

        if (agora - dataMensagem > limiteEmMs) {
            await deleteDoc(doc(db, 'mensagens', docSnap.id));
        }
    });
}

// Registra o Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}