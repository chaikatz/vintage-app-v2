'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FILTERS, applyFilterToCanvas, formatDateStamp, generateStoryImage } from '@/lib/filters'

const DEFAULT_BIO = 'Collecting moments, not things'
const ONE_YEAR_REJECTION = 'This memory needs more time. VINTAGE is for photos at least one year old.'

function isOlderThanOneYear(dateValue) {
  if (!dateValue) return false
  const source = new Date(dateValue)
  if (Number.isNaN(source.getTime())) return false
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return source <= oneYearAgo
}

function createInviteCode() {
  return `VNT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function formatAgoLabel(dateValue) {
  const date = new Date(dateValue)
  const now = new Date()
  const years = Math.max(1, now.getFullYear() - date.getFullYear())
  return `${years} year${years > 1 ? 's' : ''} ago`
}

async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) return null

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`)
    if (!response.ok) return null
    const payload = await response.json()
    const city = payload?.address?.city || payload?.address?.town || payload?.address?.village
    const country = payload?.address?.country
    if (city && country) return `${city}, ${country}`
    return country || payload?.display_name || null
  } catch {
    return null
  }
}

function FilteredPhoto({ src, filter, dateStamp, className = '', onClick }) {
  const canvasRef = useRef(null)
  const [processed, setProcessed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) return

    const context = canvas.getContext('2d')
    const image = new Image()
    image.crossOrigin = 'anonymous'
    setProcessed(false)

    image.onload = () => {
      canvas.width = image.width
      canvas.height = image.height
      context.drawImage(image, 0, 0)
      applyFilterToCanvas(canvas, context, filter, dateStamp)
      setProcessed(true)
    }

    image.src = src
  }, [src, filter, dateStamp])

  return (
    <div onClick={onClick} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className={`w-full h-auto block transition-opacity duration-300 ${processed ? 'opacity-100' : 'opacity-0'}`}
      />
      {!processed && <div className="w-full pb-[100%] bg-gray-200 shimmer" />}
    </div>
  )
}

export default function VintageApp() {
  const [screen, setScreen] = useState('welcome')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 })

  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' })
  const [authError, setAuthError] = useState('')

  const [notification, setNotification] = useState('')
  const [loadingFeed, setLoadingFeed] = useState(false)

  const [posts, setPosts] = useState([])
  const [likedPosts, setLikedPosts] = useState(new Set())
  const [commentsByPost, setCommentsByPost] = useState({})
  const [commentDraftByPost, setCommentDraftByPost] = useState({})
  const [selectedProfilePost, setSelectedProfilePost] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [followingSet, setFollowingSet] = useState(new Set())

  const [uploadStep, setUploadStep] = useState('select')
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedPreview, setUploadedPreview] = useState(null)
  const [selectedFilter, setSelectedFilter] = useState('slimAarons')
  const [uploadCaption, setUploadCaption] = useState('')
  const [photoDate, setPhotoDate] = useState(null)
  const [manualDate, setManualDate] = useState('')
  const [needsManualDate, setNeedsManualDate] = useState(false)
  const [memoryBank, setMemoryBank] = useState([])

  const myPosts = useMemo(() => posts.filter((post) => post.user_id === user?.id), [posts, user?.id])
  const onThisDay = useMemo(() => {
    const now = new Date()
    return memoryBank.filter((item) => {
      const date = new Date(item.photoDate)
      return date.getDate() === now.getDate() && date.getMonth() === now.getMonth()
    })
  }, [memoryBank])

  function showNotification(message) {
    setNotification(message)
  }

  function resetUploadSelection() {
    if (uploadedPreview) {
      URL.revokeObjectURL(uploadedPreview)
    }
    setUploadStep('select')
    setUploadedFile(null)
    setUploadedPreview(null)
    setUploadCaption('')
    setPhotoDate(null)
    setManualDate('')
    setNeedsManualDate(false)
    setSelectedFilter('slimAarons')
  }

  useEffect(() => {
    const timer = notification ? setTimeout(() => setNotification(''), 3000) : null
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [notification])

  useEffect(() => {
    return () => {
      if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
      memoryBank.forEach((item) => URL.revokeObjectURL(item.objectUrl))
    }
  }, [uploadedPreview, memoryBank])

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        setScreen('feed')
      } else {
        setUser(null)
        setProfile(null)
        setPosts([])
        setCommentsByPost({})
        setScreen('welcome')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    refreshAll()
  }, [user])

  async function refreshAll() {
    await Promise.all([
      loadProfile(),
      loadFollowing(),
      loadLikes(),
      loadProfileStats(),
      loadPosts()
    ])
  }

  async function loadProfile() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!error) setProfile(data)
  }

  async function loadProfileStats() {
    const [{ count: following }, { count: followers }] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id)
    ])

    setProfileStats({ following: following || 0, followers: followers || 0 })
  }

  async function loadFollowing() {
    const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (!error) setFollowingSet(new Set((data || []).map((item) => item.following_id)))
  }

  async function loadLikes() {
    const { data, error } = await supabase.from('likes').select('post_id').eq('user_id', user.id)
    if (!error) setLikedPosts(new Set((data || []).map((item) => item.post_id)))
  }

  async function loadPosts() {
    setLoadingFeed(true)

    const { data: follows, error: followsError } = await supabase.from('follows').select('following_id').eq('follower_id', user.id)
    if (followsError) {
      showNotification('Could not load follows')
      setLoadingFeed(false)
      return
    }

    const visibleUserIds = [user.id, ...(follows || []).map((item) => item.following_id)]

    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .in('user_id', visibleUserIds)
      .order('created_at', { ascending: false })

    if (postsError) {
      showNotification('Could not load feed')
      setLoadingFeed(false)
      return
    }

    const userIds = [...new Set((postsData || []).map((post) => post.user_id))]
    const { data: profileRows } = userIds.length
      ? await supabase.from('profiles').select('id, username, avatar_url, bio').in('id', userIds)
      : { data: [] }

    const mergedPosts = (postsData || []).map((post) => ({
      ...post,
      profile: (profileRows || []).find((row) => row.id === post.user_id)
    }))

    setPosts(mergedPosts)

    if (!postsData?.length) {
      setCommentsByPost({})
      setLoadingFeed(false)
      return
    }

    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select('id, post_id, text, created_at, user_id')
      .in('post_id', postsData.map((post) => post.id))
      .order('created_at', { ascending: true })

    if (commentsError) {
      setCommentsByPost({})
      setLoadingFeed(false)
      return
    }

    const commenterIds = [...new Set((comments || []).map((comment) => comment.user_id))]
    const { data: commenterProfiles } = commenterIds.length
      ? await supabase.from('profiles').select('id, username').in('id', commenterIds)
      : { data: [] }

    const usernameById = new Map((commenterProfiles || []).map((item) => [item.id, item.username]))

    const grouped = (comments || []).reduce((acc, current) => {
      if (!acc[current.post_id]) acc[current.post_id] = []
      acc[current.post_id].push({
        ...current,
        username: usernameById.get(current.user_id) || 'user'
      })
      return acc
    }, {})

    setCommentsByPost(grouped)
    setLoadingFeed(false)
  }

  async function ensureAuthedSession(email, password) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) return true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
  }

  async function createStarterInvites(creatorId) {
    const payload = Array.from({ length: 5 }).map(() => ({ code: createInviteCode(), creator_id: creatorId }))
    const { error } = await supabase.from('invite_codes').insert(payload)
    return !error
  }

  async function handleAuth() {
    setAuthError('')

    if (!authForm.email || !authForm.password) {
      setAuthError('Email and password are required')
      return
    }

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password
      })

      if (error || !data?.user?.id) {
        setAuthError(error?.message || 'Signup failed')
        return
      }

      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: authForm.username?.trim() || authForm.email.split('@')[0],
        bio: DEFAULT_BIO
      })

      const authed = await ensureAuthedSession(authForm.email, authForm.password)
      if (authed) {
        await createStarterInvites(data.user.id)
      }

      showNotification('Welcome to VINTAGE')
      setAuthMode('login')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
    if (error) {
      setAuthError(error.message)
      return
    }
    showNotification('Welcome back')
  }

  async function handlePickMemory(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
    const nextPreview = URL.createObjectURL(file)

    setUploadedFile(file)
    setUploadedPreview(nextPreview)
    setUploadStep('filter')

    try {
      const exifr = (await import('exifr')).default
      const exif = await exifr.parse(file)
      const parsedDate = exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal) : null

      if (!parsedDate) {
        setNeedsManualDate(true)
        setPhotoDate(null)
        showNotification('No EXIF date found. Please enter memory date manually.')
        return
      }

      if (!isOlderThanOneYear(parsedDate)) {
        showNotification(ONE_YEAR_REJECTION)
        resetUploadSelection()
        return
      }

      setNeedsManualDate(false)
      setPhotoDate(parsedDate)
    } catch {
      setNeedsManualDate(true)
      setPhotoDate(null)
      showNotification('No EXIF date found. Please enter memory date manually.')
    }
  }

  async function importMemoryBank(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const exifr = (await import('exifr')).default

    const loaded = await Promise.all(files.map(async (file) => {
      let exif = null
      try {
        exif = await exifr.parse(file)
      } catch {
        exif = null
      }

      const photoDate = exif?.DateTimeOriginal || new Date(file.lastModified)
      const locationName = await reverseGeocode(exif?.latitude, exif?.longitude)

      return {
        id: `${file.name}-${file.lastModified}`,
        file,
        objectUrl: URL.createObjectURL(file),
        filename: file.name,
        photoDate,
        locationName
      }
    }))

    setMemoryBank((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]))
      loaded.forEach((item) => byId.set(item.id, item))
      return [...byId.values()].sort((a, b) => new Date(b.photoDate) - new Date(a.photoDate))
    })
    showNotification('Memories indexed locally')
  }

  function useMemoryForPost(memory) {
    if (!isOlderThanOneYear(memory.photoDate)) {
      showNotification(ONE_YEAR_REJECTION)
      return
    }

    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview)
    setUploadedFile(memory.file)
    setUploadedPreview(memory.objectUrl)
    setUploadStep('filter')
    setNeedsManualDate(false)
    setPhotoDate(new Date(memory.photoDate))
  }

  async function handleCreatePost() {
    if (!uploadedFile) {
      showNotification('Select a memory first')
      return
    }

    const effectiveDate = needsManualDate ? new Date(manualDate) : photoDate
    if (!effectiveDate || Number.isNaN(effectiveDate.getTime())) {
      showNotification('Add a valid memory date')
      return
    }

    if (!isOlderThanOneYear(effectiveDate)) {
      showNotification(ONE_YEAR_REJECTION)
      return
    }

    const fileName = `${user.id}/${Date.now()}-${uploadedFile.name}`
    const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, uploadedFile)
    if (uploadError) {
      showNotification('Upload failed')
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

    const { error: postError } = await supabase.from('posts').insert({
      user_id: user.id,
      image_url: publicUrl,
      caption: uploadCaption.trim(),
      filter: selectedFilter,
      photo_date: effectiveDate.toISOString(),
      date_stamp: formatDateStamp(effectiveDate)
    })

    if (postError) {
      showNotification('Post failed')
      return
    }

    resetUploadSelection()
    setScreen('feed')
    showNotification('Memory posted')
    await refreshAll()
  }

  async function handleLike(post) {
    const liked = likedPosts.has(post.id)
    if (liked) {
      await supabase.from('likes').delete().eq('user_id', user.id).eq('post_id', post.id)
      await supabase.from('posts').update({ likes: Math.max((post.likes || 1) - 1, 0) }).eq('id', post.id)
    } else {
      await supabase.from('likes').insert({ user_id: user.id, post_id: post.id })
      await supabase.from('posts').update({ likes: (post.likes || 0) + 1 }).eq('id', post.id)
    }

    await Promise.all([loadLikes(), loadPosts()])
  }

  async function handleDeletePost(postId) {
    const post = posts.find((item) => item.id === postId)
    if (!post || post.user_id !== user?.id) return

    const shouldDelete = window.confirm('Delete this memory? This cannot be undone.')
    if (!shouldDelete) return

    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) {
      showNotification('Could not delete post')
      return
    }

    showNotification('Memory deleted')
    await loadPosts()
  }

  async function handleComment(postId) {
    const draft = commentDraftByPost[postId] || ''
    if (!draft.trim()) return

    const { error } = await supabase.from('comments').insert({ user_id: user.id, post_id: postId, text: draft.trim() })
    if (error) {
      showNotification('Could not add comment')
      return
    }

    setCommentDraftByPost((prev) => ({ ...prev, [postId]: '' }))
    await loadPosts()
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, bio, avatar_url')
      .ilike('username', `%${searchQuery.trim()}%`)
      .limit(20)

    if (error) {
      showNotification('Search failed')
      return
    }

    setSearchResults(data || [])
  }

  async function toggleFollow(targetUserId) {
    if (followingSet.has(targetUserId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId)
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId })
    }

    await Promise.all([loadFollowing(), loadProfileStats(), loadPosts()])
  }

  async function saveProfile() {
    if (!profile?.username?.trim()) {
      showNotification('Username required')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: profile.username.trim(), bio: profile.bio || DEFAULT_BIO })
      .eq('id', user.id)

    if (error) {
      showNotification('Could not save profile')
      return
    }

    showNotification('Profile updated')
    await loadProfile()
  }

  function exportStory(post) {
    const dateStamp = post.date_stamp || formatDateStamp(post.photo_date || new Date())
    showNotification('Preparing story export...')
    generateStoryImage(post.image_url, post.filter, dateStamp, (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `vintage-story-${dateStamp}.png`
      anchor.click()
      URL.revokeObjectURL(url)
      showNotification('Story image saved')
    })
  }

  return (
    <div className="min-h-screen pb-24">
      {notification && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-vintage-charcoal text-white px-4 py-2 rounded text-sm">{notification}</div>}

      {selectedProfilePost && (
        <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4" onClick={() => setSelectedProfilePost(null)}>
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button className="text-white text-sm underline" onClick={() => setSelectedProfilePost(null)}>Close</button>
            </div>
            <div className="bg-white rounded-xl p-3">
              <FilteredPhoto
                src={selectedProfilePost.image_url}
                filter={selectedProfilePost.filter}
                dateStamp={selectedProfilePost.date_stamp}
                className="rounded overflow-hidden"
              />
              <p className="text-sm mt-3"><span className="font-semibold mr-2">{selectedProfilePost.profile?.username || profile?.username}</span>{selectedProfilePost.caption}</p>
            </div>
          </div>
        </div>
      )}

      {screen === 'welcome' && (
        <section className="min-h-screen flex flex-col justify-center max-w-md mx-auto px-8 text-center fade-in">
          <h1 className="text-5xl tracking-[7px] mb-4">VINTAGE</h1>
          <p className="italic text-vintage-muted mb-2">The future is retro.</p>
          <p className="italic text-vintage-muted mb-8">A museum for your memories</p>
          <div className="space-y-3">
            {authMode === 'signup' && (
              <>
                <input className="w-full p-3 border rounded bg-white" placeholder="Username" value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} />
              </>
            )}
            <input className="w-full p-3 border rounded bg-white" type="email" placeholder="Email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            <input className="w-full p-3 border rounded bg-white" type="password" placeholder="Password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            {authError && <p className="text-sm text-red-600">{authError}</p>}
            <button onClick={handleAuth} className="w-full p-3 bg-vintage-charcoal text-white tracking-[2px]">{authMode === 'login' ? 'ENTER MUSEUM' : 'CREATE ACCOUNT'}</button>
            <button className="underline text-sm" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
              {authMode === 'login' ? 'Need an account?' : 'Already have an account?'}
            </button>
          </div>
        </section>
      )}

      {user && screen !== 'welcome' && (
        <>
          <header className="sticky top-0 bg-vintage-cream border-b p-4 z-30">
            <div className="max-w-xl mx-auto flex justify-between items-center">
              <h2 className="tracking-[4px] text-xl">VINTAGE</h2>
              <button className="text-sm underline" onClick={refreshAll}>Refresh</button>
            </div>
          </header>

          <main className="max-w-xl mx-auto p-4 fade-in">
            {screen === 'feed' && (
              <div className="space-y-5">
                {loadingFeed && <p className="text-vintage-muted text-center py-8">Loading feed...</p>}
                {!loadingFeed && posts.length === 0 && <p className="text-vintage-muted text-center py-16">Follow friends to fill your museum feed.</p>}
                {posts.map((post) => (
                  <article key={post.id} className="bg-white p-3 rounded-lg shadow-sm border border-[#ece9df]">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{post.profile?.username || 'anonymous'}</p>
                        <p className="text-xs text-vintage-muted">{new Date(post.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="text-xs underline" onClick={() => exportStory(post)}>Story export</button>
                        {post.user_id === user?.id && (
                          <button className="text-xs text-red-500 underline" onClick={() => handleDeletePost(post.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                    <FilteredPhoto src={post.image_url} filter={post.filter} dateStamp={post.date_stamp} className="rounded overflow-hidden" />
                    <div className="flex items-center justify-between mt-2">
                      <button onClick={() => handleLike(post)}>{likedPosts.has(post.id) ? '♥' : '♡'} {post.likes || 0}</button>
                    </div>
                    <p className="mt-2"><span className="font-semibold mr-2">{post.profile?.username}</span>{post.caption}</p>

                    <div className="mt-3 pt-2 border-t">
                      <div className="space-y-1 mb-2">
                        {(commentsByPost[post.id] || []).slice(-3).map((comment) => (
                          <p key={comment.id} className="text-sm"><span className="font-semibold mr-1">{comment.username}</span>{comment.text}</p>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 border rounded px-2 py-1 text-sm"
                          placeholder="Write a comment"
                          value={commentDraftByPost[post.id] || ''}
                          onChange={(event) => setCommentDraftByPost((prev) => ({ ...prev, [post.id]: event.target.value }))}
                        />
                        <button className="text-sm underline" onClick={() => handleComment(post.id)}>Post</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {screen === 'upload' && (
              <section className="space-y-4">
                <h3 className="text-xl">Add memory</h3>
                {uploadStep === 'select' && (
                  <label className="block border-2 border-dashed rounded-lg p-10 text-center bg-white cursor-pointer">
                    <input type="file" accept="image/*" onChange={handlePickMemory} className="hidden" />
                    Select a photo at least one year old
                  </label>
                )}

                {uploadStep === 'filter' && uploadedPreview && (
                  <>
                    <FilteredPhoto src={uploadedPreview} filter={selectedFilter} dateStamp={formatDateStamp(photoDate || manualDate || new Date())} className="rounded overflow-hidden" />
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {Object.entries(FILTERS).map(([key, filter]) => (
                        <button key={key} className={`px-3 py-2 rounded text-sm ${selectedFilter === key ? 'bg-vintage-charcoal text-white' : 'bg-white border'}`} onClick={() => setSelectedFilter(key)}>{filter.name}</button>
                      ))}
                    </div>
                    {needsManualDate && (
                      <div>
                        <input type="date" className="w-full p-3 border rounded bg-white" value={manualDate} onChange={(event) => setManualDate(event.target.value)} />
                        <p className="text-xs text-vintage-muted mt-1">No EXIF date was found. You can manually enter the memory date.</p>
                      </div>
                    )}
                    <input value={uploadCaption} onChange={(event) => setUploadCaption(event.target.value)} className="w-full p-3 border rounded bg-white" placeholder="Location, year..." />
                    <div className="grid grid-cols-2 gap-2">
                      <button className="w-full p-3 bg-vintage-charcoal text-white" onClick={handleCreatePost}>Post memory</button>
                      <button className="w-full p-3 border" onClick={resetUploadSelection}>Cancel</button>
                    </div>
                  </>
                )}

                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold mb-2">Memories browser</h4>
                  <label className="inline-block text-sm underline cursor-pointer mb-4">
                    Index local photos
                    <input type="file" multiple accept="image/*" onChange={importMemoryBank} className="hidden" />
                  </label>
                  <p className="text-sm text-vintage-muted mb-2">On this day</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {onThisDay.slice(0, 6).map((item) => (
                      <button key={item.id} onClick={() => useMemoryForPost(item)} className="text-left">
                        <img src={item.objectUrl} alt={item.filename} className="w-full aspect-square object-cover rounded" />
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-vintage-muted mb-2">Timeline</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {memoryBank.map((item) => (
                      <div key={item.id} className="flex gap-3 items-center">
                        <button onClick={() => useMemoryForPost(item)}>
                          <img src={item.objectUrl} alt={item.filename} className="w-12 h-12 rounded object-cover" />
                        </button>
                        <div className="flex-1">
                          <p className="text-sm">{formatAgoLabel(item.photoDate)} {item.locationName ? `— ${item.locationName}` : ''}</p>
                          <p className="text-xs text-vintage-muted">{new Date(item.photoDate).toLocaleDateString()} · {item.filename}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {screen === 'search' && (
              <section>
                <div className="flex gap-2 mb-3">
                  <input className="flex-1 p-3 border rounded bg-white" placeholder="Search usernames" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                  <button className="px-4 bg-vintage-charcoal text-white rounded" onClick={handleSearch}>Go</button>
                </div>
                <div className="space-y-3">
                  {searchResults.map((result) => (
                    <div key={result.id} className="bg-white p-3 rounded flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{result.username}</p>
                        <p className="text-sm text-vintage-muted">{result.bio || DEFAULT_BIO}</p>
                      </div>
                      {result.id !== user.id && (
                        <button className="text-sm underline" onClick={() => toggleFollow(result.id)}>{followingSet.has(result.id) ? 'Unfollow' : 'Follow'}</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {screen === 'profile' && profile && (
              <section className="space-y-4">
                <h3 className="text-xl">Profile</h3>
                <div className="bg-white p-5 rounded-xl border border-[#ece9df] space-y-3">
                  <input className="w-full p-3 border rounded-lg" value={profile.username || ''} onChange={(event) => setProfile({ ...profile, username: event.target.value })} />
                  <div className="rounded-lg border border-[#ece9df] bg-[#faf9f4] p-3">
                    <p className="text-xs uppercase tracking-wider text-vintage-muted mb-2">Bio</p>
                    <textarea className="w-full p-0 border-0 bg-transparent focus:outline-none text-sm leading-relaxed" rows={4} value={profile.bio || ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="Collecting moments, not things" />
                  </div>
                  <button className="text-sm underline" onClick={saveProfile}>Save profile</button>
                </div>
                <div className="grid grid-cols-3 text-center bg-white rounded p-3">
                  <Stat label="Posts" value={myPosts.length} />
                  <Stat label="Followers" value={profileStats.followers} />
                  <Stat label="Following" value={profileStats.following} />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {myPosts.map((post) => (
                    <button key={post.id} className="text-left" onClick={() => setSelectedProfilePost(post)}>
                      <FilteredPhoto src={post.image_url} filter={post.filter} dateStamp={post.date_stamp} className="aspect-square overflow-hidden rounded" />
                    </button>
                  ))}
                </div>
                <button className="underline text-sm" onClick={() => supabase.auth.signOut()}>Log out</button>
              </section>
            )}
          </main>

          <nav className="fixed bottom-4 left-0 right-0 z-40">
            <div className="max-w-xl mx-auto px-4">
              <div className="grid grid-cols-4 text-center text-xs bg-white border border-[#e8e4d8] rounded-2xl shadow-lg overflow-hidden">
                <button className={`py-3 transition-colors ${screen === 'feed' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('feed')}>Feed</button>
                <button className={`py-3 transition-colors ${screen === 'search' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('search')}>Search</button>
                <button className={`py-3 transition-colors ${screen === 'upload' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('upload')}>Upload</button>
                <button className={`py-3 transition-colors ${screen === 'profile' ? 'bg-vintage-charcoal text-white' : 'text-vintage-charcoal'}`} onClick={() => setScreen('profile')}>Profile</button>
              </div>
            </div>
          </nav>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-vintage-muted uppercase">{label}</p>
    </div>
  )
}
