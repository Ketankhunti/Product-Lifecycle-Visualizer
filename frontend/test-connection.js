// Simple test to check if we can make HTTP requests
console.log('Testing fetch capability...')

fetch('http://httpbin.org/get')
  .then(response => {
    console.log('HTTP test response status:', response.status)
    return response.json()
  })
  .then(data => {
    console.log('HTTP test successful:', data)
  })
  .catch(error => {
    console.error('HTTP test failed:', error)
  })

// Test localhost connection
setTimeout(() => {
  console.log('Testing localhost connection...')
  fetch('http://localhost:8080/api/lifecycle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_name: "test product",
      description: "a simple test product for validation"
    })
  })
  .then(response => {
    console.log('Backend response status:', response.status)
    console.log('Backend response headers:', [...response.headers.entries()])
    return response.text()
  })
  .then(data => {
    console.log('Backend response:', data)
  })
  .catch(error => {
    console.error('Backend connection failed:', error)
  })
}, 2000)
