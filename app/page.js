'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { FILTERS, applyFilterToCanvas, generateStoryImage, formatDateStamp } from '@/lib/filters'

// Icons as components
const HomeIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

const SearchIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
)

const PlusIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)

const MessageIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const ProfileIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2" : "1.5"} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
)

// Filtered Photo Component
function FilteredPhoto({ src, filter, dateStamp, onClick, className = '' }) {
  const canvasRef = useRef(null)
  const [processed, setProcessed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return

    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      applyFilterToCanvas(canvas, ctx, filter, dateStamp)
      setProcessed(true)
    }
    
    img.src = src
  }, [src, filter, dateStamp])

  return (
    <div className={`relative ${className}`} onClick={onClick}>
      <canvas
        ref={canvasRef}
        className={`w-full h-auto block transition-opacity duration-300 ${processed ? 'opacity-100' : 'opacity-0'}`}
      />
      {!processed && (
        <div className="w-full pb-[100%] bg-gray-200 shimmer" />
      )}
    </div>
  )
}

export default function VintageApp() {
  // Auth state
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // App state
  const [screen, setScreen] = useState('welcome')
  const [posts, setPosts] = useState([])
  const [notification, setNotification] = useState(null)
  
  // Upload state
  const [uploadStep, setUploadStep] = useState('select')
  const [uploadedImage, setUploadedImage] = useState(null)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [selectedFilter, setSelectedFilter] = useState('slimAarons')
  const [uploadCaption, setUploadCaption] = useState('')
  const [photoDate, setPhotoDate] = useState(null)
  
  // Memory state
  const [todayMemories, setTodayMemories] = useState([])
  const [showMemoryPrompt, setShowMemoryPrompt] = useState(true)
  const [currentMemoryIndex, setCurrentMemoryIndex] = useState(0)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
        loadPosts()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      } else {
        setUser(null)
        setScreen('welcome')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load posts
  async function loadPosts() {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(username, avatar_url)')
      .order('created_at', { ascending: false })
    
    if (data) {
      setPosts(data)
      checkTodayMemories(data)
    }
  }

  // Check for "On This Day" memories
  function checkTodayMemories(allPosts) {
    const today = new Date()
    const memories = allPosts.filter(post => {
      if (!post.photo_date) return false
      const postDate = new Date(post.photo_date)
      return (
        postDate.getMonth() === today.getMonth() &&
        postDate.getDate() === today.getDate() &&
        postDate.getFullYear() < today.getFullYear()
      )
    })
    setTodayMemories(memories)
  }

  // Show notification
  function showNotification(message) {
    setNotification(message)
    setTimeout(() => setNotification(null), 2500)
  }

  // Auth handlers
  async function handleSignUp() {
    setAuthLoading(true)
    setAuthError('')
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    
    if (error) {
      setAuthError(error.message)
    } else if (data.user) {
      // Create profile
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: username || email.split('@')[0],
        bio: 'Collecting moments, not things',
      })
      showNotification('Welcome to VINTAGE!')
      loadPosts()
    }
    setAuthLoading(false)
  }

  async function handleLogin() {
    setAuthLoading(true)
    setAuthError('')
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      setAuthError(error.message)
    } else {
      showNotification('Welcome back!')
      loadPosts()
    }
    setAuthLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setScreen('welcome')
    setPosts([])
  }

  // Photo handlers
  async function handlePhotoSelect(e) {
    const file = e.target.files[0]
    if (!file) return

    setUploadedFile(file)
    
    // Read image for preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setUploadedImage(event.target.result)
      setUploadStep('filter')
    }
    reader.readAsDataURL(file)
    
    // Extract EXIF date
    try {
      const exifr = (await import('exifr')).default
      const exif = await exifr.parse(file)
      if (exif?.DateTimeOriginal) {
        setPhotoDate(new Date(exif.DateTimeOriginal))
      } else {
        setPhotoDate(new Date())
      }
    } catch {
      setPhotoDate(new Date())
    }
  }

  async function handlePost() {
    if (!uploadedFile || !uploadCaption.trim()) {
      showNotification('Please add a caption')
      return
    }

    showNotification('Posting memory...')

    // Upload image to Supabase Storage
    const fileName = `${user.id}/${Date.now()}-${uploadedFile.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, uploadedFile)

    if (uploadError) {
      showNotification('Failed to upload image')
      return
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(fileName)

    // Create post
    const { error: postError } = await supabase.from('posts').insert({
      user_id: user.id,
      image_url: publicUrl,
      caption: uploadCaption,
      filter: selectedFilter,
      photo_date: photoDate?.toISOString(),
      date_stamp: formatDateStamp(photoDate || new Date()),
    })

    if (postError) {
      showNotification('Failed to create post')
      return
    }

    // Reset and refresh
    setUploadedImage(null)
    setUploadedFile(null)
    setUploadCaption('')
    setUploadStep('select')
    setSelectedFilter('slimAarons')
    setPhotoDate(null)
    setScreen('feed')
    loadPosts()
    showNotification('Memory posted!')
  }

  // Like handler
  async function handleLike(postId) {
    const post = posts.find(p => p.id === postId)
    const newLikes = (post.likes || 0) + 1
    
    await supabase
      .from('posts')
      .update({ likes: newLikes })
      .eq('id', postId)
    
    setPosts(posts.map(p => 
      p.id === postId ? { ...p, likes: newLikes } : p
    ))
  }

  // Story export
  function handleStoryExport(post) {
    showNotification('Creating Story image...')
    
    generateStoryImage(
      post.image_url,
      post.filter,
      post.date_stamp,
      (blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vintage-${post.date_stamp.replace(/\//g, '-')}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showNotification('Saved! Share to Instagram Stories')
      }
    )
  }

  // Get years ago
  function getYearsAgo(date) {
    return new Date().getFullYear() - new Date(date).getFullYear()
  }

  // Render
  return (
    <div className="min-h-screen relative pb-[70px]">
      {/* Notification */}
      {notification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-vintage-charcoal text-white px-6 py-3 rounded text-sm z-[1000] shadow-lg max-w-[90%]">
          {notification}
        </div>
      )}

      {/* Welcome / Auth Screen */}
      {screen === 'welcome' && (
        <div className="min-h-screen flex flex-col justify-center p-8 text-center fade-in">
          {/* Logo */}
          <div className="mb-10">
            <svg className="w-20 h-20 mx-auto mb-5" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" stroke="#2C2C2C" strokeWidth="1.5" fill="none"/>
              <rect x="6" y="6" width="20" height="16" fill="#D4D4D4"/>
              <rect x="6" y="22" width="20" height="6" fill="white" stroke="#2C2C2C" strokeWidth="0.5"/>
            </svg>
          </div>
          
          <h1 className="text-4xl tracking-[6px] mb-4 font-light">VINTAGE</h1>
          <p className="text-vintage-muted italic mb-10">A museum for your memories</p>

          {/* Auth Form */}
          <div className="space-y-4 max-w-xs mx-auto w-full">
            {authMode === 'signup' && (
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-4 border border-gray-300 rounded font-serif text-sm bg-white"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded font-serif text-sm bg-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded font-serif text-sm bg-white"
            />
            
            {authError && (
              <p className="text-red-500 text-sm">{authError}</p>
            )}
            
            <button
              onClick={authMode === 'login' ? handleLogin : handleSignUp}
              disabled={authLoading}
              className="w-full p-4 bg-vintage-charcoal text-white tracking-[2px] text-sm disabled:opacity-50"
            >
              {authLoading ? 'LOADING...' : authMode === 'login' ? 'ENTER' : 'CREATE ACCOUNT'}
            </button>
            
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
              className="text-vintage-muted text-sm underline"
            >
              {authMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
            </button>
          </div>
        </div>
      )}

      {/* Main App */}
      {screen !== 'welcome' && user && (
        <>
          {/* Header */}
          <div className="sticky top-0 z-50 bg-vintage-cream border-b border-gray-300 p-5">
            <div className="flex items-center justify-center gap-3">
              <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="24" height="24" stroke="#2C2C2C" strokeWidth="1.5" fill="none"/>
                <rect x="6" y="6" width="20" height="16" fill="#D4D4D4"/>
                <rect x="6" y="22" width="20" height="6" fill="white" stroke="#2C2C2C" strokeWidth="0.5"/>
              </svg>
              <span className="text-xl font-light tracking-[4px]">VINTAGE</span>
            </div>
          </div>

          {/* Feed Screen */}
          {screen === 'feed' && (
            <div className="p-4 fade-in">
              {/* On This Day */}
              {todayMemories.length > 0 && showMemoryPrompt && (
                <div className="memory-card rounded-xl p-5 mb-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-lg font-semibold text-vintage-gold flex items-center gap-2">
                        🕰️ On This Day
                      </div>
                      <div className="text-sm text-vintage-muted">
                        {getYearsAgo(todayMemories[currentMemoryIndex].photo_date)} years ago
                      </div>
                    </div>
                    <button onClick={() => setShowMemoryPrompt(false)} className="text-xl opacity-50">
                      ×
                    </button>
                  </div>

                  <FilteredPhoto
                    src={todayMemories[currentMemoryIndex].image_url}
                    filter={todayMemories[currentMemoryIndex].filter}
                    dateStamp={todayMemories[currentMemoryIndex].date_stamp}
                    className="rounded-lg overflow-hidden mb-3"
                  />

                  <p className="text-sm mb-3">
                    <span className="font-semibold">{todayMemories[currentMemoryIndex].profiles?.username}</span>
                    {' • '}
                    {todayMemories[currentMemoryIndex].caption}
                  </p>

                  <button
                    onClick={() => handleStoryExport(todayMemories[currentMemoryIndex])}
                    className="w-full p-3 bg-white border border-vintage-charcoal rounded-lg text-sm flex items-center justify-center gap-2"
                  >
                    <ShareIcon /> Export to Instagram Story
                  </button>
                </div>
              )}

              {/* Posts */}
              {posts.map(post => (
                <div key={post.id} className="bg-white rounded-lg p-3 mb-5 shadow-sm">
                  <div className="flex items-center mb-3">
                    <div className="w-8 h-8 rounded-full bg-gray-300 mr-3 flex items-center justify-center text-sm">
                      {post.profiles?.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <span className="font-semibold text-sm">{post.profiles?.username || 'Anonymous'}</span>
                  </div>

                  <FilteredPhoto
                    src={post.image_url}
                    filter={post.filter}
                    dateStamp={post.date_stamp}
                    className="rounded overflow-hidden mb-3"
                  />

                  <div className="flex items-center gap-4 mb-2">
                    <button onClick={() => handleLike(post.id)} className="text-xl">
                      ♡
                    </button>
                    <button
                      onClick={() => handleStoryExport(post)}
                      className="ml-auto flex items-center gap-1 text-xs text-vintage-muted"
                    >
                      <ShareIcon /> STORY
                    </button>
                  </div>

                  <p className="text-sm font-medium mb-1">{post.likes || 0} likes</p>
                  <p className="text-sm">
                    <span className="font-semibold mr-2">{post.profiles?.username}</span>
                    {post.caption}
                  </p>
                </div>
              ))}

              {posts.length === 0 && (
                <div className="text-center py-20 text-vintage-muted">
                  <p className="mb-4">No memories yet</p>
                  <button 
                    onClick={() => setScreen('upload')}
                    className="text-vintage-charcoal underline"
                  >
                    Post your first memory
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upload Screen */}
          {screen === 'upload' && (
            <div className="p-5 fade-in">
              <h2 className="text-xl mb-5">Add Memory</h2>

              {uploadStep === 'select' && (
                <label className="block border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-vintage-charcoal transition">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <div className="text-4xl mb-3">📷</div>
                  <p className="text-vintage-muted">Tap to select a photo</p>
                </label>
              )}

              {uploadStep === 'filter' && uploadedImage && (
                <>
                  <FilteredPhoto
                    src={uploadedImage}
                    filter={selectedFilter}
                    dateStamp={formatDateStamp(photoDate || new Date())}
                    className="rounded-lg overflow-hidden mb-5"
                  />

                  <div className="flex gap-2 overflow-x-auto pb-3 mb-5 no-scrollbar">
                    {Object.entries(FILTERS).map(([key, filter]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedFilter(key)}
                        className={`flex-shrink-0 px-4 py-2 rounded text-xs ${
                          selectedFilter === key 
                            ? 'bg-vintage-charcoal text-white' 
                            : 'bg-gray-200'
                        }`}
                      >
                        {filter.name}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Add a caption..."
                    value={uploadCaption}
                    onChange={(e) => setUploadCaption(e.target.value)}
                    className="w-full p-4 border border-gray-300 rounded mb-4 font-serif text-sm"
                  />

                  <button
                    onClick={handlePost}
                    className="w-full p-4 bg-vintage-charcoal text-white tracking-[2px] text-sm rounded"
                  >
                    POST MEMORY
                  </button>
                </>
              )}
            </div>
          )}

          {/* Profile Screen */}
          {screen === 'profile' && (
            <div className="p-5 fade-in">
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-full bg-gray-300 mx-auto mb-4 flex items-center justify-center text-3xl">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <p className="font-semibold">{user?.email?.split('@')[0]}</p>
                <p className="text-sm text-vintage-muted italic">Collecting moments, not things</p>
              </div>

              <div className="flex justify-center gap-10 py-5 border-y border-gray-300 mb-5">
                <div className="text-center">
                  <p className="text-xl font-semibold">{posts.filter(p => p.user_id === user?.id).length}</p>
                  <p className="text-xs text-vintage-muted uppercase tracking-wider">Posts</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold">0</p>
                  <p className="text-xs text-vintage-muted uppercase tracking-wider">Followers</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold">0</p>
                  <p className="text-xs text-vintage-muted uppercase tracking-wider">Following</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {posts.filter(p => p.user_id === user?.id).map(post => (
                  <div key={post.id} className="aspect-square overflow-hidden">
                    <FilteredPhoto
                      src={post.image_url}
                      filter={post.filter}
                      className="h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleLogout}
                className="w-full mt-8 p-3 border border-vintage-charcoal rounded text-sm"
              >
                Log Out
              </button>
            </div>
          )}

          {/* Search Screen */}
          {screen === 'search' && (
            <div className="p-5 fade-in">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full p-4 border border-gray-300 rounded mb-5 font-serif text-sm"
              />
              <p className="text-center text-vintage-muted">Search coming soon</p>
            </div>
          )}

          {/* Messages Screen */}
          {screen === 'messages' && (
            <div className="p-5 fade-in">
              <h2 className="text-xl mb-5">Messages</h2>
              <p className="text-center text-vintage-muted py-10">Coming soon</p>
            </div>
          )}

          {/* Bottom Navigation */}
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-vintage-cream border-t border-gray-300 flex justify-around py-4 z-50">
            {[
              { id: 'feed', Icon: HomeIcon },
              { id: 'search', Icon: SearchIcon },
              { id: 'upload', Icon: PlusIcon },
              { id: 'messages', Icon: MessageIcon },
              { id: 'profile', Icon: ProfileIcon },
            ].map(({ id, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setScreen(id)
                  if (id === 'upload') {
                    setUploadStep('select')
                    setUploadedImage(null)
                  }
                }}
                className={`p-1 transition-opacity ${screen === id ? 'opacity-100' : 'opacity-40'}`}
              >
                <Icon active={screen === id} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
