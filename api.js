const API_BASE = 'https://beachprotool.test.808.by/api'

export async function api(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE}${endpoint}`

    const options = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    }

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body)
    }

    const res = await fetch(url, options)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
        const error = new Error(data.message || 'Ошибка сервера')
        error.status = res.status
        error.data = data
        throw error
    }

    return data
}

// Сокращения для HTTP-методов
export const apiGet = (endpoint) => api(endpoint)
export const apiPost = (endpoint, body) => api(endpoint, 'POST', body)
export const apiPut = (endpoint, body) => api(endpoint, 'PUT', body)
export const apiDelete = (endpoint) => api(endpoint, 'DELETE')